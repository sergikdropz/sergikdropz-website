# 📸 Instagram Helper Workflow

## ✅ What It Does

The **Instagram Helper** page (`/instagram-helper`) is where you upload Instagram post URLs. When you save URLs there, they are automatically:

1. ✅ Saved to `data/instagram-posts.json` (for backward compatibility)
2. ✅ Saved to `instagram_media` database table (for video downloads)

## 🚀 How to Use

### Step 1: Start Your Server

```bash
cd web
npm run dev
```

### Step 2: Open Instagram Helper

Visit: `http://localhost:3000/instagram-helper`

### Step 3: Add Instagram URLs

1. **Get Instagram Post URLs:**
   - Open Instagram (web or app)
   - Navigate to a post
   - Click three dots (⋯) → "Copy link"
   - Or copy URL from browser address bar

2. **Paste URLs:**
   - Paste each URL into a field
   - Click "📋 Paste" button to paste from clipboard
   - Add multiple posts using "+ Add Another Post"

3. **Save:**
   - Click "Save X Post(s)" button
   - URLs are saved to both file and database ✅

### Step 4: Get Video URLs (Optional)

If you have Instagram API credentials:

```bash
node scripts/fetch-instagram-video-urls.mjs
```

This will:
- Fetch video URLs from Instagram Graph API
- Update database with actual video URLs

### Step 5: Download & Upload Videos (Optional)

```bash
node scripts/fetch-and-download-instagram-videos.mjs
```

This will:
- Download videos from Instagram
- Upload to Supabase Storage
- Update database with Supabase Storage URLs

## 📋 What Gets Saved

When you save URLs in the Instagram Helper:

**To Database:**
- Post URL
- Permalink
- Media type (video/image)
- Post ID
- Username
- Placeholder thumbnail URLs
- Video URL: `null` (will be populated later)

**To JSON File:**
- Array of post URLs
- Username

## 🔄 Workflow Summary

```
Instagram Helper
    ↓ (Save URLs)
Database + JSON File
    ↓ (Optional: Get video URLs)
Instagram API → Database (video URLs)
    ↓ (Optional: Download videos)
Download Script → Supabase Storage → Database (Supabase URLs)
    ↓
Frontend displays videos! 🎬
```

## 💡 Tips

- **No API needed:** You can manually add URLs without Instagram API
- **API recommended:** For automatic video URL fetching
- **Videos work:** Once URLs are in database, videos will play (via proxy or Supabase Storage)

---

**The Instagram Helper is your main tool for adding Instagram posts!** 🎉

