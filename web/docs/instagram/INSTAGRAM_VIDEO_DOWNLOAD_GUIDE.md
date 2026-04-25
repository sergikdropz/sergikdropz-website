# 🎬 Instagram Video Download & Upload Guide

## Overview

This script downloads Instagram videos in **highest quality** and uploads them to Supabase Storage for efficient web playback.

## Why This Approach is Optimal

✅ **Highest Quality**: Uses Instagram's `video_url` (best available quality)  
✅ **Efficient Format**: MP4/H.264 is hardware-accelerated in browsers  
✅ **No Re-encoding**: Preserves original quality  
✅ **Fast Loading**: Lazy loading + thumbnails + metadata preload  
✅ **CDN Delivery**: Supabase Storage provides fast global CDN  
✅ **Range Requests**: Supports video seeking without full download

## Prerequisites

1. **Supabase configured** in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

2. **Instagram posts** added to `web/data/instagram-posts.json`

3. **Database table** exists (from `supabase/schema.sql`)

## Usage

### Run the Script

```bash
cd web
node scripts/download-instagram-videos-to-supabase.mjs
```

### What It Does

1. ✅ Reads all Instagram post URLs from `instagram-posts.json`
2. ✅ Scrapes metadata (gets highest quality `video_url`)
3. ✅ Downloads videos as MP4 files (streaming for large files)
4. ✅ Uploads to Supabase Storage bucket `instagram-videos`
5. ✅ Uploads thumbnails (for poster images)
6. ✅ Updates database with Supabase Storage URLs
7. ✅ Cleans up temporary files

### Output

The script will:
- Show progress for each video
- Display file sizes
- Provide a summary at the end
- Store videos in Supabase Storage with public URLs

## Storage Bucket

The script automatically creates the `instagram-videos` bucket if it doesn't exist:
- **Public**: Yes (for direct video access)
- **File Size Limit**: 100MB per file
- **MIME Types**: `video/mp4`

## Database Updates

Each video is saved to the `instagram_media` table with:
- `video_url`: Supabase Storage URL (for playback)
- `media_url`: Same (for compatibility)
- `thumbnail_url`: Supabase Storage URL (for poster)
- All metadata (dimensions, duration, caption, etc.)

## Performance Optimizations

The component (`InstagramMediaGrid`) includes:

1. **Lazy Loading**: Videos only load when visible (100px before viewport)
2. **Poster Images**: Thumbnails shown before video loads
3. **Metadata Preload**: Only loads video metadata, not full file
4. **Progressive Loading**: Videos load on-demand when expanded
5. **Hardware Acceleration**: MP4/H.264 uses GPU decoding

## Troubleshooting

### Videos Not Downloading

- Check Instagram URLs are valid
- Verify network connection
- Check if posts are public

### Upload Fails

- Verify Supabase credentials in `.env.local`
- Check bucket permissions
- Ensure file size is under 100MB

### Database Errors

- Run `supabase/schema.sql` to create tables
- Check Supabase connection
- Verify service role key has permissions

## Next Steps

After running the script:

1. ✅ Videos are in Supabase Storage
2. ✅ Database has all metadata
3. ✅ Homepage will load videos efficiently
4. ✅ No external dependencies (all self-hosted)

## Cost Considerations

- **Supabase Free Tier**: 1GB storage
- **After Free**: ~$0.19/month per 10GB
- **Typical Video**: 5-20MB each
- **11 Videos**: ~100-200MB total

---

**Ready to run?** Just execute the script and it will handle everything automatically! 🚀


