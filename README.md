# Redicals

A fast academic journal index I made for class. It's designed to search through thousands of articles instantly.

**[Live Demo](https://redicals.vercel.app)**

## What is this?

This is a project I made for **LIS 198: Data Structures for LIS** by Shan Surat. It's basically a test assignment to show how we can make websites search really fast using Redis.

Because it's just a class project, I skipped adding complex stuff like user login or authentication. The main focus is just on using Redis to make the search speed super fast! Also, if you notice any rough edges or glitches with the UI, please excuse them—my primary focus for this assignment was entirely on the backend functionality and pushing the search speed to the limit.

## Screenshots & Demo

<div align="center">
  <video src="Demo.mov" controls="controls" width="100%" style="margin-bottom: 20px; border-radius: 8px;"></video>
  
  <img src="/public/Home.png" alt="Home Screen" width="45%" style="margin: 5px;" />
  <img src="/public/Result.png" alt="Search Results" width="45%" style="margin: 5px;" />
  <img src="/public/Add.png" alt="Add Periodical" width="45%" style="margin: 5px;" />
  <img src="/public/Edit.png" alt="Edit Periodical" width="45%" style="margin: 5px;" />
</div>

## Tools I Used

- **Frontend**: Next.js (React)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Search & Cache**: Upstash Redis
- **Icons**: Lucide React

## How to run it

If you want to run this on your own computer:

1. Clone the repo:
   ```bash
   git clone https://github.com/shansurat/redicals
   cd redicals
   ```

2. Install everything:
   ```bash
   npm install
   ```

3. Setup your keys:
   Make a `.env.local` file in the main folder. You'll need your own Supabase and Upstash Redis accounts for this:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   UPSTASH_REDIS_REST_URL=your_upstash_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ```

4. Start it up:
   ```bash
   npm run dev
   ```
   Then just open `http://localhost:3000` in your browser.

## How I made the search so fast

Instead of having the main database search through everything slowly every time you type, I used **Redis**.

1. **Squashing the data**: The server grabs all the important text (like titles, authors, and abstracts) and squashes it into a really small, simple list saved in Redis.
2. **Local searching**: When you open the site, your browser downloads that tiny list once. So when you start typing in the search bar, your computer just filters its own memory. It doesn't even talk to the server while you type, which makes it feel instant!
3. **Getting the details**: Once your browser figures out the exact 20 articles you need, it asks Redis to fetch just those specific ones so they can show up on your screen.

By doing this, we avoid downloading huge chunks of data over the internet every time you type a letter, making the whole thing super snappy.
