'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Periodical } from '@/lib/types';
import { Search, ExternalLink, Calendar, Users, BookOpen, Tag, Plus, Edit2, Trash2, X, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { deletePeriodicalAdmin, fetchPeriodicalsServer, savePeriodicalServer, fetchSearchIndex, fetchPeriodicalsByIds } from '@/app/actions';
import { useInView } from 'react-intersection-observer';

const PAGE_SIZE = 20;

type LightweightIndexItem = {i: string, s: string, t: string, j: string, d: number};

export default function PeriodicalExplorer() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const [periodicals, setPeriodicals] = useState<Periodical[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('publication_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [searchIndex, setSearchIndex] = useState<LightweightIndexItem[] | null>(null);

  const { ref, inView } = useInView();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPeriodical, setEditingPeriodical] = useState<Periodical | null>(null);

  // Load search index exactly once on mount
  useEffect(() => {
    fetchSearchIndex().then((data: LightweightIndexItem[]) => {
      setSearchIndex(data);
    }).catch((err: any) => console.error("Failed to load search index:", err));
  }, []);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Reset pagination when search or sort changes
  useEffect(() => {
    setPage(0);
    setPeriodicals([]);
    setHasMore(true);
    setTotalCount(null);
    setSearchTime(null);
  }, [debouncedQuery, sortBy, sortOrder, refreshTrigger]);

  // Fetch data
  useEffect(() => {
    async function loadPeriodicals() {
      if (page === 0) setLoading(true);
      
      const t0 = performance.now();
      
      try {
        if (debouncedQuery && searchIndex) {
          // Client-Side Search Engine!
          const term = debouncedQuery.toLowerCase();
          
          // Instant Memory Filter
          const filtered = searchIndex.filter(p => p.s.includes(term));
          
          // Sort
          filtered.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'title') {
              comparison = a.t.localeCompare(b.t);
            } else if (sortBy === 'journal') {
              comparison = a.j.localeCompare(b.j);
            } else { // default date
              comparison = a.d - b.d;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
          });
          
          // Paginate
          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE;
          const paginatedIds = filtered.slice(from, to).map(p => p.i);
          
          if (paginatedIds.length === 0) {
            setHasMore(false);
            if (page === 0) {
              setPeriodicals([]);
              setTotalCount(filtered.length);
              setSearchTime(Math.round(performance.now() - t0));
            }
            return;
          }
          
          // Fetch just the hydrated 20 items from Server
          const { data, executionMs } = await fetchPeriodicalsByIds(paginatedIds);
          setPeriodicals(prev => page === 0 ? data : [...prev, ...data]);
          setHasMore(to < filtered.length);
          if (page === 0) {
            setTotalCount(filtered.length);
            // Add server hydration time + client local time
            setSearchTime(Math.round(performance.now() - t0));
          }
        } else {
          // Default Load
          const { data, hasMore: more, totalCount: count, executionMs } = await fetchPeriodicalsServer(page, '', PAGE_SIZE, sortBy, sortOrder);
          setPeriodicals(prev => page === 0 ? data : [...prev, ...data]);
          setHasMore(more);
          if (page === 0) {
            setTotalCount(count);
            setSearchTime(executionMs || Math.round(performance.now() - t0));
          }
        }
      } catch (err: any) {
        console.error('Fetch error:', err.message);
      } finally {
        setLoading(false);
      }
    }
    
    loadPeriodicals();
  }, [page, debouncedQuery, sortBy, sortOrder, searchIndex, refreshTrigger]);

  // Handle infinite scroll trigger
  useEffect(() => {
    if (inView && hasMore && !loading) {
      setPage(prev => prev + 1);
    }
  }, [inView, hasMore, loading]);

  function refreshList(savedItem?: Periodical) {
    if (savedItem && searchIndex) {
      // Optimistic Local Index Update (Prevents double network requests)
      const dateStr = savedItem.publication_date ? new Date(savedItem.publication_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }).toLowerCase() : '';
      const searchable = [
        savedItem.title || '',
        savedItem.abstract || '',
        savedItem.journal || '',
        dateStr,
        ...(savedItem.authors || []),
        ...(savedItem.tags || [])
      ].join(' ').toLowerCase();
      
      const newItem = {
        i: savedItem.id,
        s: searchable,
        t: (savedItem.title || '').toLowerCase(),
        j: (savedItem.journal || '').toLowerCase(),
        d: savedItem.publication_date ? new Date(savedItem.publication_date).getTime() : 0
      };

      setSearchIndex(prev => {
        if (!prev) return prev;
        const copy = [...prev];
        const idx = copy.findIndex(p => p.i === savedItem.id);
        if (idx >= 0) copy[idx] = newItem;
        else copy.unshift(newItem);
        return copy;
      });
      setPage(0);
    } else {
      // Fallback
      fetchSearchIndex().then(data => {
        setSearchIndex(data);
        setPage(0);
      }).catch(err => console.error("Failed to refresh index:", err));
    }
  }

  async function handleDelete(id: string) {
    const previous = [...periodicals];
    setPeriodicals(periodicals.filter(p => p.id !== id));
    if (totalCount !== null) setTotalCount(prev => (prev || 1) - 1);
    
    try {
      await deletePeriodicalAdmin(id);
      // Update local index cache
      if (searchIndex) {
        setSearchIndex(prev => prev ? prev.filter(p => p.i !== id) : null);
      }
    } catch (error: any) {
      console.error('Delete failed:', error);
      setPeriodicals(previous);
      if (totalCount !== null) setTotalCount(prev => (prev || 0) + 1);
    }
  }

  function openEditModal(periodical: Periodical) {
    setEditingPeriodical(periodical);
    setIsModalOpen(true);
  }

  function openAddModal() {
    setEditingPeriodical(null);
    setIsModalOpen(true);
  }

// ... PeriodicalCard and Modal component definitions continue below ...

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="flex items-center text-sm text-muted">
          <span className="font-semibold">Redicals</span>
          <span className="mx-2">/</span>
          <span className="font-medium text-foreground">Index</span>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Periodical
        </button>
      </header>

      <main className="flex-1 p-8 max-w-[1400px] mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">Redicals Index</h1>
          <p className="text-muted">A comprehensive, lightning-fast index of academic journals and articles.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8 max-w-4xl">
          <div className="relative group flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted transition-colors group-focus-within:text-foreground" />
            <input
              type="text"
              placeholder="Search titles, journals, or abstracts..."
              className="w-full h-12 pl-10 pr-24 bg-card hover:bg-card-hover focus:bg-card border border-border rounded-lg outline-none transition-colors shadow-sm focus:ring-2 focus:ring-foreground/10 text-foreground placeholder:text-muted"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {totalCount !== null && !loading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted bg-background/80 px-2 py-1 rounded-md border border-border/50">
                {totalCount} results {searchTime !== null && `in ${searchTime}ms`}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 shrink-0">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="h-12 bg-card hover:bg-card-hover border border-border rounded-lg outline-none px-4 text-foreground cursor-pointer focus:ring-2 focus:ring-foreground/10 appearance-none min-w-[120px]"
            >
              <option value="publication_date">Date</option>
              <option value="title">Title</option>
              <option value="journal">Journal</option>
            </select>
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="h-12 w-12 bg-card hover:bg-card-hover border border-border rounded-lg flex items-center justify-center text-foreground transition-colors focus:ring-2 focus:ring-foreground/10"
              title={sortOrder === 'asc' ? "Ascending" : "Descending"}
            >
              {sortOrder === 'asc' ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {loading && page === 0 ? (
          <div className="text-muted py-8 text-center border border-dashed border-border rounded-lg">Loading...</div>
        ) : periodicals.length === 0 ? (
          <div className="text-center py-12 text-muted border border-dashed border-border rounded-lg">
            No periodicals found matching "{query}"
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
            {periodicals.map((periodical) => (
              <PeriodicalCard 
                key={periodical.id} 
                periodical={periodical} 
                onEdit={() => openEditModal(periodical)}
                onDelete={() => handleDelete(periodical.id)}
              />
            ))}
          </div>
        )}
        
        {hasMore && periodicals.length > 0 && (
          <div ref={ref} className="py-12 text-center text-muted w-full flex justify-center">
            <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin"></div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <PeriodicalModal 
          periodical={editingPeriodical} 
          onClose={() => setIsModalOpen(false)} 
          onSaved={(savedItem) => refreshList(savedItem)} 
        />
      )}
    </div>
  );
}

const subtleColors = [
  'bg-slate-500/5 border-slate-500/20 hover:border-slate-500/40',
  'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40',
  'bg-indigo-500/5 border-indigo-500/20 hover:border-indigo-500/40',
  'bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40',
  'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40',
  'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40',
  'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40',
  'bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40'
];

function PeriodicalCard({ periodical, onEdit, onDelete }: { periodical: Periodical, onEdit: () => void, onDelete: () => void }) {
  // Deterministic color based on ID to avoid hydration mismatches and keep colors stable
  const colorIndex = periodical.id ? periodical.id.charCodeAt(0) % subtleColors.length : 0;
  const colorClass = subtleColors[colorIndex];

  return (
    <div className={`group border rounded-xl p-6 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col gap-4 relative ${colorClass}`}>
      <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-foreground/10 text-muted hover:text-foreground transition-colors" title="Edit">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex justify-between items-start gap-4 pr-16">
        <h3 className="text-xl font-semibold leading-tight group-hover:text-foreground/80 transition-colors">
          {periodical.title || 'Untitled'}
        </h3>
      </div>
      
      <p className="text-sm text-foreground/70 line-clamp-3 flex-1">
        {periodical.abstract || 'No abstract available.'}
      </p>

      <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-border/50">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
          {periodical.journal && (
            <div className="flex items-center gap-1.5 font-medium text-foreground/80">
              <BookOpen className="w-4 h-4" />
              <span>{periodical.journal}</span>
            </div>
          )}
          {periodical.authors && periodical.authors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>{periodical.authors.join(', ')}</span>
            </div>
          )}
          {periodical.publication_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>{new Date(periodical.publication_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-2">
            {periodical.tags?.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-foreground/10 text-xs font-medium text-foreground/70">
                {tag}
              </span>
            ))}
          </div>
          {periodical.url && (
            <a 
              href={periodical.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-foreground hover:underline underline-offset-2"
            >
              Visit <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodicalModal({ periodical, onClose, onSaved }: { periodical: Periodical | null, onClose: () => void, onSaved: (item: Periodical) => void }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [formData, setFormData] = useState({
    title: periodical?.title || '',
    authors: periodical?.authors?.join(', ') || '',
    journal: periodical?.journal || '',
    publication_date: periodical?.publication_date || '',
    abstract: periodical?.abstract || '',
    url: periodical?.url || '',
    tags: periodical?.tags?.join(', ') || ''
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const payload: Partial<Periodical> = {
      ...(periodical?.id && { id: periodical.id }),
      title: formData.title.trim(),
      authors: formData.authors ? formData.authors.split(',').map(s => s.trim()).filter(Boolean) : [],
      journal: formData.journal.trim(),
      publication_date: formData.publication_date || undefined,
      abstract: formData.abstract.trim(),
      url: formData.url.trim(),
      tags: formData.tags ? formData.tags.split(',').map(s => s.trim()).filter(Boolean) : []
    };

    try {
      const savedData = await savePeriodicalServer(payload);
      onSaved(savedData);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{periodical ? 'Edit Periodical' : 'Add Periodical'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-border rounded text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Title *</label>
            <input required type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Journal</label>
              <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.journal} onChange={e => setFormData({...formData, journal: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Publication Date</label>
              <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.publication_date} onChange={e => setFormData({...formData, publication_date: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Authors (comma separated)</label>
            <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.authors} onChange={e => setFormData({...formData, authors: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Tags (comma separated)</label>
            <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.tags} onChange={e => setFormData({...formData, tags: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">URL</label>
            <input type="url" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Abstract</label>
            <textarea rows={4} className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground focus:ring-2 focus:ring-foreground/10 outline-none resize-none" value={formData.abstract} onChange={e => setFormData({...formData, abstract: e.target.value})} />
          </div>
          
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md font-medium text-foreground hover:bg-card-hover transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-md font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Periodical'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
