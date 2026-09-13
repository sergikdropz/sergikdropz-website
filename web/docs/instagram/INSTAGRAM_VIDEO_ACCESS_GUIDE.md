# Instagram Video Access Guide

## Current Situation

Instagram has **restricted direct access** to video URLs due to their policies. This means:
- ❌ Scraping HTML for video URLs no longer works reliably
- ❌ Direct video URL access is blocked
- ✅ **Instagram Graph API** is the official way to get video URLs

## Solution: Use Instagram Graph API

The automated pipeline now **prioritizes Instagram Graph API** when credentials are available.

### Step 1: Get Instagram API Credentials

**Option A: Use Instagram Helper (Easiest)**
1. Visit: `http://localhost:3000/instagram-helper`
2. Click **"🔗 Connect Instagram Account"**
3. Authorize the app
4. Credentials are saved automatically

**Option B: Manual Setup**
1. Go to: https://developers.facebook.com/apps/
2. Select your app (or create one)
3. Add **Instagram Basic Display** product
4. Get **Access Token** and **User ID**
5. Add to `web/.env.local`:
   ```
   INSTAGRAM_ACCESS_TOKEN=your_token_here
   INSTAGRAM_USER_ID=your_user_id_here
   ```

### Step 2: How It Works Now

When you save URLs via Instagram Helper:
1. ✅ **Tries Instagram Graph API first** (if credentials available)
2. ✅ Gets video URLs from official API
3. ✅ Downloads videos automatically
4. ✅ Uploads to Supabase Storage
5. ✅ Updates database with Supabase URLs

### Step 3: For Existing Posts

If you have API credentials, run:
```bash
cd web
node scripts/fetch-instagram-video-urls.mjs
```

This will:
- Fetch video URLs from Instagram Graph API
- Update database with video URLs
- Then you can run: `node scripts/fetch-and-download-instagram-videos.mjs`

## Why Scraping Fails

Instagram has implemented restrictions that prevent:
- Direct HTML scraping of video URLs
- Accessing video URLs without authentication
- Downloading videos without proper API access

This is part of Instagram's content protection policies.

## Alternative: Manual Upload

If you can't get API credentials:
1. Download videos manually from Instagram
2. Upload to Supabase Storage bucket `instagram-videos`
3. Update database with Supabase Storage URLs

## References

- [Instagram Help Center](https://help.instagram.com/620154495870484/?helpref=uf_share)
- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api/)

---

**The automated pipeline will work once Instagram API credentials are set up!** ✅

