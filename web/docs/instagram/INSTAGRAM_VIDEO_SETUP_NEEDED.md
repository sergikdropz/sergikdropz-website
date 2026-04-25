# ⚠️ Instagram Video Setup Required

## Current Status

✅ **Database:** 12 posts saved (11 videos, 1 image)  
✅ **Storage:** `instagram-videos` bucket created  
✅ **Code:** All video playback code ready  
❌ **Video URLs:** Need Instagram API credentials to fetch

## The Issue

Instagram **requires authentication** to get video URLs. The database currently has placeholder URLs, not actual video URLs that can be downloaded.

## Solution: Set Up Instagram API

### Option 1: Use Instagram Helper Page (Easiest)

1. **Start your Next.js server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Open Instagram Helper:**
   ```
   http://localhost:3000/instagram-helper
   ```

3. **Click "🔗 Connect Instagram Account"** (if you have Business/Creator account)
   - This will set up OAuth and save credentials automatically

4. **Click "🔄 Refresh from Instagram API"**
   - This will fetch posts with video URLs

5. **Then run:**
   ```bash
   node scripts/fetch-and-download-instagram-videos.mjs
   ```

### Option 2: Manual API Setup

1. **Get Instagram API credentials:**
   - Go to: https://developers.facebook.com/apps
   - Create/select your app
   - Set up Instagram Graph API
   - Get Access Token and User ID

2. **Add to `web/.env.local`:**
   ```bash
   INSTAGRAM_ACCESS_TOKEN=your_access_token_here
   INSTAGRAM_USER_ID=your_user_id_here
   ```

3. **Run the script:**
   ```bash
   cd web
   node scripts/fetch-and-download-instagram-videos.mjs
   ```

## What the Script Does

1. ✅ Fetches video URLs from Instagram Graph API
2. ✅ Updates database with video URLs
3. ✅ Downloads videos from Instagram
4. ✅ Uploads videos to Supabase Storage
5. ✅ Updates database with Supabase Storage URLs

## After Setup

Once videos are uploaded:
- ✅ Videos will play directly from Supabase Storage
- ✅ No more proxying needed
- ✅ Fast CDN delivery
- ✅ Reliable playback

## Current Database URLs

The database currently has placeholder URLs like:
```
/api/instagram/proxy-image?url=https%3A%2F%2Finstagram.com%2Fp%2F...
```

These need to be replaced with actual Instagram video URLs (via API) or Supabase Storage URLs (after upload).

---

**Once you set up Instagram API credentials, I can automatically download and upload all videos!** 🚀

