'use server';

import { redis } from '@/lib/upstash';
import { Periodical } from '@/lib/types';
import { createClient } from '@supabase/supabase-js';

export async function syncPeriodicalToRedis(periodical: Periodical) {
  try {
    // Store individual periodical in a Redis hash
    await redis.hset('periodicals', { [periodical.id]: periodical });
    
    // Update lightweight search index
    const searchIndexData = await redis.get('search_index');
    if (searchIndexData) {
      const index = (typeof searchIndexData === 'string' ? JSON.parse(searchIndexData) : searchIndexData) as {i: string, s: string, t: string, j: string, d: number}[];
      
      const dateStr = periodical.publication_date ? new Date(periodical.publication_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }).toLowerCase() : '';
      const searchable = [
        periodical.title || '',
        periodical.abstract || '',
        periodical.journal || '',
        dateStr,
        ...(periodical.authors || []),
        ...(periodical.tags || [])
      ].join(' ').toLowerCase();
      
      const newItem = {
        i: periodical.id,
        s: searchable,
        t: (periodical.title || '').toLowerCase(),
        j: (periodical.journal || '').toLowerCase(),
        d: periodical.publication_date ? new Date(periodical.publication_date).getTime() : 0
      };
      
      const existingIdx = index.findIndex(p => p.i === periodical.id);
      if (existingIdx >= 0) {
        index[existingIdx] = newItem;
      } else {
        index.unshift(newItem); // Add to beginning for newer items
      }
      await redis.set('search_index', JSON.stringify(index));
    }
    console.log(`Synced periodical ${periodical.id} to Upstash Redis and updated search index`);
  } catch (e) {
    console.error("Failed to sync to Upstash Redis:", e);
  }
}

export async function deletePeriodicalFromRedis(id: string) {
  try {
    await redis.hdel('periodicals', id);
    
    const searchIndexData = await redis.get('search_index');
    if (searchIndexData) {
      const index = (typeof searchIndexData === 'string' ? JSON.parse(searchIndexData) : searchIndexData) as {i: string, s: string, t: string, j: string, d: number}[];
      const newIndex = index.filter(p => p.i !== id);
      await redis.set('search_index', JSON.stringify(newIndex));
    }
    
    console.log(`Deleted periodical ${id} from Upstash Redis and updated search index`);
  } catch (e) {
    console.error("Failed to delete from Upstash Redis:", e);
  }
}

export async function deletePeriodicalAdmin(id: string) {
  console.log('Server Action: deletePeriodicalAdmin called with id:', id);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server configuration error: Missing Supabase Admin Keys');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { error, count } = await supabaseAdmin.from('periodicals').delete({ count: 'exact' }).eq('id', id);
  
  console.log(`Server Action: delete result - error: ${error}, count: ${count}`);

  if (error) throw new Error(error.message);
  if (count === 0) throw new Error('Supabase processed the request but 0 rows were deleted. This usually means the ID does not exist in the database.');
  
  // Invalidate all Page 0 caches
  const keys = await redis.keys('cache:periodicals:page:0:*');
  if (keys.length > 0) await redis.del(...keys);
  
  // Clean up Redis backup too
  await deletePeriodicalFromRedis(id);
}

export async function fetchPeriodicalsServer(page: number, query: string, pageSize: number, sortBy: string = 'publication_date', sortOrder: 'asc' | 'desc' = 'desc') {
  const t0 = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server configuration error');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  
  // Only cache if it's the first page and there is no search query
  const canCache = page === 0 && !query;
  const CACHE_KEY = `cache:periodicals:page:0:${sortBy}:${sortOrder}`;
  
  if (canCache) {
    const cachedData: any = await redis.get(CACHE_KEY);
    if (cachedData) {
      console.log(`Redis Cache HIT for periodicals page 0 (${sortBy} ${sortOrder})`);
      if (Array.isArray(cachedData)) {
        return { data: cachedData as Periodical[], hasMore: true, totalCount: cachedData.length, executionMs: Date.now() - t0 };
      } else {
        return { 
          data: cachedData.data as Periodical[], 
          hasMore: cachedData.hasMore, 
          totalCount: cachedData.totalCount,
          executionMs: Date.now() - t0
        };
      }
    }
    console.log(`Redis Cache MISS for periodicals page 0 (${sortBy} ${sortOrder})`);
  }
  
  // If no query, fallback to Supabase
  let dbQuery = supabaseAdmin.from('periodicals')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortOrder === 'asc' });
    
  const from = page * pageSize;
  const to = from + pageSize - 1;
  
  const { data, error, count } = await dbQuery.range(from, to);
  
  if (error) throw new Error(error.message);
  
  const hasMore = count !== null && (from + (data?.length || 0)) < count;
  const totalCount = count || 0;
  
  if (canCache && data) {
    await redis.setex(CACHE_KEY, 60, { data, hasMore, totalCount });
  }
  
  return { data: data as Periodical[], hasMore, totalCount, executionMs: Date.now() - t0 };
}

export async function fetchSearchIndex() {
  const searchIndexData = await redis.get('search_index');
  if (!searchIndexData) return [];
  return (typeof searchIndexData === 'string' ? JSON.parse(searchIndexData) : searchIndexData) as {i: string, s: string, t: string, j: string, d: number}[];
}

export async function fetchPeriodicalsByIds(ids: string[]) {
  const t0 = Date.now();
  if (ids.length === 0) return { data: [], executionMs: Date.now() - t0 };
  const actualItemsDict: any = await redis.hmget('periodicals', ...ids);
  const data = ids.map(id => actualItemsDict[id]).filter(Boolean) as Periodical[];
  return { data, executionMs: Date.now() - t0 };
}

export async function savePeriodicalServer(payload: Partial<Periodical>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server configuration error');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  
  let res;
  if (payload.id) {
    res = await supabaseAdmin.from('periodicals').update(payload).eq('id', payload.id).select().single();
  } else {
    res = await supabaseAdmin.from('periodicals').insert([payload]).select().single();
  }
  
  if (res.error) throw new Error(res.error.message);
  
  // Invalidate all Page 0 caches
  const keys = await redis.keys('cache:periodicals:page:0:*');
  if (keys.length > 0) await redis.del(...keys);
  
  // Sync to Redis backup hash
  await syncPeriodicalToRedis(res.data);
  
  return res.data;
}
