# 🚀 Instagram Auto-Fetch - Quick Start

## ✅ What You Get

- **Automatic updates** - Posts refresh every 6 hours (configurable)
- **No manual work** - Set it once, forget about it
- **Always fresh** - Your homepage always shows latest posts

## 🎯 3-Step Setup

### Step 1: Get Instagram API Credentials (10 minutes)

Follow: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`

You need:
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`

### Step 2: Add to `.env.local`

```bash
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_USER_ID=your_user_id
```

### Step 3: Test It

```bash
cd web
node scripts/refresh-instagram-posts.mjs
```

If you see "✅ Successfully updated", you're ready!

---

## 🤖 Enable Auto-Refresh

### Option A: Vercel Cron (Easiest - If on Vercel)

Already configured in `vercel.json`! Just deploy to Vercel and it runs automatically every 6 hours.

### Option B: External Cron Service (Works Anywhere)

1. Sign up at https://cron-job.org (free)
2. Create cron job:
   - **URL**: `https://yourdomain.com/api/instagram/cron`
   - **Schedule**: Every 6 hours
   - **Method**: GET
3. Save - done!

### Option C: Manual Refresh Button

Visit `/instagram-helper` and click "🔄 Refresh from Instagram API"

---

## 📊 Check Status

```bash
curl https://yourdomain.com/api/instagram/refresh
```

Shows:
- Last update time
- Number of posts
- Whether API is configured

---

## ⚙️ Customize Schedule

Edit `web/vercel.json`:

```json
{
  "crons": [{
    "path": "/api/instagram/cron",
    "schedule": "0 */6 * * *"  // Change this
  }]
}
```

Common schedules:
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 */12 * * *` - Every 12 hours
- `0 9 * * *` - Daily at 9 AM

---

## ✅ That's It!

Your Instagram posts will now update automatically! 🎉

**Full guide:** See `INSTAGRAM_AUTO_FETCH_SETUP.md` for advanced options.

