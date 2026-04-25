# Instagram Media Scraping & Database Storage

## Overview

Instagram media metadata is now scraped and stored in Supabase for reliable video playback and faster loading.

## Database Schema

The `instagram_media` table stores:
- Post URLs and permalinks
- Media type (image/video)
- Direct video URLs for playback
- Thumbnail URLs
- Captions, dimensions, duration
- Metadata (likes, comments, etc.)

## Setup

### 1. Run Database Migration

Add the Instagram media table to your Supabase database:

```sql
-- Run this in Supabase SQL Editor
-- Or use the migration file: supabase/migrations/add_instagram_media_table.sql
```

The table is also included in the main `supabase/schema.sql` file.

### 2. Scrape Instagram Posts

Run the scraping script to fetch and save media metadata:

```bash
cd web
node scripts/scrape-instagram-media.mjs
```

**Note:** Make sure your Next.js dev server is running (`npm run dev`) before running the script.

### 3. API Endpoints

#### Scrape Posts (POST)
```bash
POST /api/instagram/scrape
Content-Type: application/json

{
  "postUrls": [
    "https://www.instagram.com/p/ABC123/",
    "https://www.instagram.com/reel/XYZ789/"
  ]
}
```

#### Get Media (GET)
```bash
GET /api/instagram/media?username=yourusername&limit=100
```

The API will:
1. First try to fetch from Supabase database
2. Fall back to Instagram API if credentials are available
3. Fall back to scraping if database is empty

## Video Playback Fixes

### Changes Made:
1. **Database Storage**: Video URLs are now stored directly in the database
2. **Proxy Endpoint**: Updated to handle Range requests for video streaming
3. **Video Element**: Added proper error handling and fallback to thumbnail
4. **CORS Headers**: Added to proxy endpoint for cross-origin video playback

### How It Works:
- Videos use the `video_url` field from the database
- The proxy endpoint (`/api/instagram/proxy-image`) handles Range requests for seeking
- Videos play directly in the browser without redirects

## Troubleshooting

### Videos Not Playing
1. Make sure posts are scraped: `node scripts/scrape-instagram-media.mjs`
2. Check that `video_url` is populated in the database
3. Verify the proxy endpoint is working: Check browser console for errors

### Scraping Fails
1. Instagram may rate-limit requests - wait a few minutes and retry
2. Some posts may require authentication - check if post is public
3. Check server logs for specific error messages

## Next Steps

1. **Run Migration**: Add the table to your Supabase database
2. **Scrape Posts**: Run the scraping script to populate the database
3. **Test Playback**: Click on a video post to verify playback works
4. **Auto-Refresh**: Set up a cron job to periodically re-scrape posts (optional)

## Cron Job (Optional)

To automatically refresh Instagram media, add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/instagram/scrape",
      "schedule": "0 0 * * *"
    }
  ]
}
```

