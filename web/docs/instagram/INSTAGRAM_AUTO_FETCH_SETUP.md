# 🤖 Instagram Auto-Fetch Pipeline Setup

This guide will help you set up automatic fetching of Instagram posts so they update without manual intervention.

## ✅ What This Does

- **Automatically fetches** your latest Instagram posts from the API
- **Saves them** to `web/data/instagram-posts.json`
- **Updates your homepage** with fresh posts
- **Runs on a schedule** (daily, hourly, etc.)

## 🚀 Quick Setup

### Step 1: Set Up Instagram API Credentials

1. Follow the guide: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`
2. Get your credentials:
   - `INSTAGRAM_APP_ID`
   - `INSTAGRAM_APP_SECRET`
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_USER_ID`

3. Add to `web/.env.local`:
```bash
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_USER_ID=your_user_id
```

### Step 2: Test Manual Refresh

Test that the API works:

```bash
cd web
node scripts/refresh-instagram-posts.mjs
```

Or call the API endpoint:
```bash
curl -X POST http://localhost:3000/api/instagram/refresh
```

### Step 3: Set Up Automatic Refresh

Choose one of these methods:

---

## Method 1: Vercel Cron Jobs (Recommended for Production)

If you're deploying on Vercel, use their built-in cron jobs:

1. **Update `vercel.json`** (already configured):
```json
{
  "crons": [{
    "path": "/api/instagram/cron",
    "schedule": "0 */6 * * *"
  }]
}
```

This runs every 6 hours. Adjust the schedule as needed:
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 */12 * * *` - Every 12 hours

2. **Add cron secret** (optional, for security):
```bash
# In Vercel dashboard → Settings → Environment Variables
INSTAGRAM_CRON_SECRET=your_random_secret_here
```

3. **Deploy to Vercel** - cron jobs activate automatically!

---

## Method 2: External Cron Service (Works Anywhere)

Use a free cron service like cron-job.org or EasyCron:

1. **Sign up** at https://cron-job.org (free)

2. **Create a new cron job:**
   - **URL**: `https://yourdomain.com/api/instagram/cron`
   - **Schedule**: Every 6 hours (or your preference)
   - **Method**: GET
   - **Headers** (if you set INSTAGRAM_CRON_SECRET):
     - `Authorization: Bearer your_cron_secret`

3. **Save and activate** - it will call your endpoint automatically!

---

## Method 3: GitHub Actions (For GitHub Deployments)

Create `.github/workflows/refresh-instagram.yml`:

```yaml
name: Refresh Instagram Posts

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Allow manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Refresh Instagram Posts
        run: |
          curl -X POST https://yourdomain.com/api/instagram/refresh
```

---

## Method 4: Local Cron (For Development)

On macOS/Linux, add to crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs every 6 hours)
0 */6 * * * cd /path/to/project/web && node scripts/refresh-instagram-posts.mjs
```

---

## Method 5: Manual Refresh Button (Quick Option)

Add a refresh button to your admin/helper page:

1. Visit `/instagram-helper`
2. Add a "Refresh from API" button
3. Calls `/api/instagram/refresh` when clicked

---

## 🔧 API Endpoints

### Refresh Posts
```bash
POST /api/instagram/refresh
```
Fetches latest posts from Instagram API and saves them.

### Get Refresh Status
```bash
GET /api/instagram/refresh
```
Returns last update time and status.

### Cron Endpoint
```bash
GET /api/instagram/cron
```
For scheduled jobs. Can include `Authorization: Bearer <secret>` header.

---

## 📊 Monitoring

Check when posts were last updated:

```bash
curl http://localhost:3000/api/instagram/refresh
```

Response:
```json
{
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "total": 6,
  "source": "api",
  "hasApiCredentials": true
}
```

---

## ⚠️ Important Notes

### Access Token Expiration
Instagram access tokens expire after **60 days**. You'll need to:
1. Refresh your token before it expires
2. Update `INSTAGRAM_ACCESS_TOKEN` in `.env.local`
3. Or set up automatic token refresh (see guide)

### Rate Limits
- Instagram API has rate limits
- Don't refresh more than once per hour
- Recommended: Every 6-12 hours

### Long-Lived Tokens
For production, use long-lived tokens:
1. Exchange short-lived token for long-lived (valid 60 days)
2. Set up token refresh before expiration
3. See `INSTAGRAM_SETUP_GUIDE.md` for details

---

## 🐛 Troubleshooting

### "Instagram API credentials not configured"
- Check `.env.local` has all required variables
- Restart your dev server after adding env vars

### "Access token expired"
- Your token needs to be refreshed
- See `INSTAGRAM_SETUP_GUIDE.md` for token refresh steps

### "No posts found"
- Your Instagram account might be private
- Or you haven't posted anything yet
- Check your Instagram account directly

### Cron job not running
- Check Vercel cron logs (if using Vercel)
- Verify the endpoint URL is correct
- Check cron service logs (if using external service)

---

## ✅ Success Checklist

- [ ] Instagram API credentials configured
- [ ] Manual refresh works (`node scripts/refresh-instagram-posts.mjs`)
- [ ] Cron job or scheduled task set up
- [ ] Posts updating automatically
- [ ] Monitoring in place

---

**That's it! Your Instagram posts will now update automatically! 🎉**

