# Redicals

A high-performance index of academic journals and articles built for speed. Redicals is designed to instantly filter through thousands of periodicals without any network bottleneck.

## Purpose

This project was developed by Shan Surat in fulfillment of the requirements for **LIS 198: Data Structures**. Its primary goal is to demonstrate advanced data structures, caching mechanisms, and extreme performance optimization in a modern web application environment.

## Screenshots

<div align="center">
  <img src="/public/Home.png" alt="Home Screen" width="45%" style="margin: 5px;" />
  <img src="/public/Result.png" alt="Search Results" width="45%" style="margin: 5px;" />
  <img src="/public/Add.png" alt="Add Periodical" width="45%" style="margin: 5px;" />
  <img src="/public/Edit.png" alt="Edit Periodical" width="45%" style="margin: 5px;" />
</div>

## Technologies Used

- **Framework**: Next.js (React)
- **Styling**: Tailwind CSS
- **Primary Database**: Supabase (PostgreSQL)
- **Search Engine & Cache**: Upstash Redis
- **Icons**: Lucide React

## Setup Instructions

Follow these steps to run the application locally:

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd redicals
   ```

2. Install the required dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env.local` file in the root directory. You will need to provision projects in Supabase and Upstash Redis, then add your connection keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   UPSTASH_REDIS_REST_URL=your_upstash_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000` to view the application.

## Architecture & Performance

While Supabase acts as the primary persistent database for storing records, the search functionality is completely decoupled. It is powered entirely by Redis to achieve sub-50ms query times across over 10,000 records.

### How the Search Was Made Fast

Traditional SQL databases perform full-text searches using disk-based queries, which can become slow as datasets grow. By utilizing Redis as an in-memory data store, we bypass disk read latency entirely.

To push the search speed to its absolute limit, Redicals implements a custom **Lightweight Client-Side Search Index** pattern:

1. **Compression**: The server extracts and squashes all searchable text (titles, abstracts, authors) into a highly compressed JSON array stored in a single Redis key.
2. **Zero-Latency Filtering**: On initial page load, the client downloads this tiny index from Redis exactly once. When a user types a query, the application filters the index directly in local memory in under 5 milliseconds.
3. **Precise Hydration**: Once the local filter identifies the exact 20 IDs needed for the current page, the server uses the Redis `HMGET` command to instantly fetch only those specific full objects.

By keeping the heavy JSON payloads in Redis and offloading the filtering to the client, Redicals avoids downloading megabytes of data on every keystroke, resulting in a completely instantaneous search experience.
