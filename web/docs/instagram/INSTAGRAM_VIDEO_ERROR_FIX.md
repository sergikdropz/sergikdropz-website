# Instagram Video Playback Error Fix

## Error: `DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed`

### What This Means

This error occurs when:
- Videos are stored with proxied Instagram URLs (not Supabase Storage URLs)
- Instagram's CDN blocks direct video access
- The browser cannot decode/play the video stream

### Root Cause

Instagram videos **cannot be played directly** from Instagram's CDN due to:
1. **CORS restrictions** - Instagram blocks cross-origin video requests
2. **Authentication required** - Videos require valid session tokens
3. **CDN protection** - Instagram's CDN blocks direct video streaming

### Solution

Videos **must be downloaded** and uploaded to **Supabase Storage** for playback.

### Quick Fix

Run this script to download all videos and upload them to Supabase:

```bash
cd web
node scripts/fetch-and-download-instagram-videos.mjs
```

This script will:
1. ✅ Fetch video URLs from Instagram API (if credentials are set)
2. ✅ Download videos to local storage
3. ✅ Upload videos to Supabase Storage
4. ✅ Update database with Supabase Storage URLs

### Current Status

Check your database status:

```bash
cd web
node scripts/verify-instagram-media.mjs
```

**Expected output:**
- ✅ Videos with Supabase Storage URLs: X (these will play)
- 🔄 Videos with proxied URLs: X (these need downloading)
- ❌ Videos without URLs: X (these need API credentials)

### After Download

Once videos are uploaded to Supabase Storage:
- ✅ Videos will play directly in the browser
- ✅ No CORS errors
- ✅ No authentication needed
- ✅ Fast CDN delivery

### Error Messages

The UI now shows helpful error messages:
- **"Video needs to be downloaded"** - Video URL is proxied Instagram URL
- **"Video format not supported"** - Browser cannot decode video
- **"Video source unavailable"** - URL is not accessible

### Troubleshooting

**If videos still don't play after download:**

1. Check Supabase Storage bucket exists:
   ```bash
   # Should show "instagram-videos" bucket
   ```

2. Verify database URLs are Supabase Storage URLs:
   ```bash
   node scripts/verify-instagram-media.mjs
   # Look for: "Videos with Supabase Storage URLs: X"
   ```

3. Check video file format:
   - Instagram videos are usually MP4
   - Browser should support MP4/H.264

4. Check browser console for errors:
   - Open DevTools → Console
   - Look for CORS or network errors

### Next Steps

1. **Get Instagram API credentials** (if not already set):
   - See `HOW_TO_GET_INSTAGRAM_TOKEN.md`
   - Or use `/instagram-helper` page

2. **Run download script**:
   ```bash
   node scripts/fetch-and-download-instagram-videos.mjs
   ```

3. **Verify videos play**:
   - Visit homepage
   - Click on a video thumbnail
   - Video should play inline

---

**The error is now handled gracefully with clear instructions on how to fix it!** ✅

