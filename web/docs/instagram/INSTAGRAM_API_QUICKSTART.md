# 🚀 Instagram API Setup - Quick Start

## ⚡ Fastest Way (5 minutes)

Run the interactive setup script - it guides you through everything:

```bash
cd web
node scripts/setup-instagram-api.mjs
```

The script will:
1. ✅ Guide you through getting App ID and App Secret
2. ✅ Help you generate an Access Token
3. ✅ Auto-fetch your User ID (or let you enter it)
4. ✅ Save everything to `.env.local`
5. ✅ Test the connection automatically

**That's it!** Your Instagram posts will start updating automatically.

---

## 📋 What You'll Need

Before running the script, make sure you have:

1. **Facebook Developer Account**
   - Sign up at: https://developers.facebook.com/
   - Takes 2 minutes

2. **Instagram Account**
   - Your Instagram profile (`@sergikdropz`)
   - Must be connected to a Facebook account

3. **5 minutes** to complete the setup

---

## 🎯 Step-by-Step (What the Script Does)

### 1. Create Facebook App
- Go to: https://developers.facebook.com/apps/
- Click "Create App"
- Choose "Consumer" or "Business"
- Name it "SERGIK Website"

### 2. Add Instagram Basic Display
- In your app, click "Add Products"
- Find "Instagram Basic Display" → "Set Up"
- Configure OAuth redirect URIs

### 3. Get Credentials
- **App ID**: Visible in Instagram Basic Display settings
- **App Secret**: Click "Show" to reveal
- **Access Token**: Generate via Graph API Explorer
- **User ID**: Auto-fetched by script (or enter manually)

### 4. Test
- Script automatically tests your credentials
- Verifies API connection
- Checks if posts can be fetched

---

## ✅ After Setup

1. **Restart your dev server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Test the refresh:**
   ```bash
   node scripts/refresh-instagram-posts.mjs
   ```

3. **Visit your homepage** - Instagram posts should appear!

---

## 🧪 Test Your Setup

Run the test script anytime:

```bash
node scripts/test-instagram-api.mjs
```

This will verify:
- ✅ All credentials are present
- ✅ API connection works
- ✅ Posts can be fetched
- ✅ Token expiry status

---

## 🔄 Auto-Refresh (Already Set Up!)

Once credentials are configured, posts will automatically refresh:
- **Every 6 hours** via Vercel Cron (if deployed)
- **Manually** via `/instagram-helper` page
- **Via script**: `node scripts/refresh-instagram-posts.mjs`

---

## 🐛 Troubleshooting

### Script says "Missing credentials"
→ Make sure you entered all values correctly

### "Access token expired"
→ Generate a new token via Graph API Explorer

### "No posts found"
→ Your account might be private or have no posts

### "User ID not found"
→ Try entering it manually instead of auto-fetch

---

## 📚 Full Documentation

- **Detailed Walkthrough**: `INSTAGRAM_API_SETUP_WALKTHROUGH.md`
- **Complete Guide**: `INSTAGRAM_SETUP_GUIDE.md`
- **Auto-Fetch Setup**: `INSTAGRAM_AUTO_FETCH_SETUP.md`

---

## 🎉 Ready to Start?

```bash
cd web
node scripts/setup-instagram-api.mjs
```

**Follow the prompts and you'll be done in 5 minutes!**

