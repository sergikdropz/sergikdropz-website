# 🚀 Instagram Automated Pipeline

## Overview

When you save Instagram post URLs in the Instagram Helper, the system automatically:

1. ✅ **Saves URLs** to database
2. ✅ **Scrapes metadata** (video URLs, thumbnails, captions)
3. ✅ **Downloads videos** from Instagram
4. ✅ **Uploads to Supabase Storage** (videos and thumbnails)
5. ✅ **Updates database** with Supabase Storage URLs
6. ✅ **Plays from Supabase** (never from Instagram URLs)

## How It Works

### Step 1: Save URLs
When you click "Save" in `/instagram-helper`:
- URLs are saved to `data/instagram-posts.json`
- Basic metadata is saved to `instagram_media` table

### Step 2: Automatic Processing (Background)
The system automatically triggers:
- **Scraping**: Extracts video URLs and metadata from Instagram
- **Downloading**: Downloads videos to temporary storage
- **Uploading**: Uploads videos to Supabase Storage bucket `instagram-videos`
- **Updating**: Updates database with Supabase Storage URLs

### Step 3: Playback
Videos play **only from Supabase Storage URLs**:
- ✅ No CORS errors
- ✅ No authentication needed
- ✅ Fast CDN delivery
- ✅ Reliable playback

## What Gets Processed

### Videos (`/reel/` URLs)
- ✅ Video file downloaded and uploaded to Supabase
- ✅ Thumbnail extracted and uploaded
- ✅ Metadata (caption, dimensions, duration) saved

### Images (`/p/` URLs)
- ✅ Thumbnail uploaded to Supabase
- ✅ Metadata saved

## Database Schema

After processing, each post has:
- `video_url`: Supabase Storage URL (for videos)
- `media_url`: Supabase Storage URL (for images/videos)
- `thumbnail_url`: Supabase Storage URL (for poster images)
- `caption`: Post caption
- `width`, `height`: Media dimensions
- `duration_seconds`: Video duration (for videos)

## Storage Bucket

Videos are stored in:
- **Bucket**: `instagram-videos`
- **Public**: Yes (for direct access)
- **Format**: MP4 (H.264)
- **Thumbnails**: JPG

## Error Handling

If processing fails:
- ✅ Save operation still succeeds
- ✅ Error is logged to console
- ✅ Post remains in database with `error_message` field
- ✅ You can retry processing later

## Manual Processing

If automatic processing fails, you can manually trigger it:

```bash
cd web
node scripts/fetch-and-download-instagram-videos.mjs
```

## Status Check

Check processing status:

```bash
cd web
node scripts/verify-instagram-media.mjs
```

Look for:
- ✅ **Videos with Supabase Storage URLs**: X (these will play)
- 🔄 **Videos with proxied URLs**: X (need processing)
- ❌ **Videos without URLs**: X (need processing)

## Troubleshooting

### Videos Not Playing
1. Check if videos have Supabase Storage URLs:
   ```bash
   node scripts/verify-instagram-media.mjs
   ```

2. If videos have proxied URLs, processing may have failed:
   - Check server logs for errors
   - Manually run: `node scripts/fetch-and-download-instagram-videos.mjs`

### Processing Takes Too Long
- Processing happens in background (non-blocking)
- Large videos take time to download/upload
- Check database `updated_at` field to see when processing completed

### Storage Bucket Missing
The system automatically creates the `instagram-videos` bucket if it doesn't exist.

---

**The pipeline is fully automated! Just save URLs and videos will be processed automatically.** 🎉

