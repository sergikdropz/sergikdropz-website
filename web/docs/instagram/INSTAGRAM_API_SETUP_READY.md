# ✅ Instagram API Setup - Ready to Go!

## 🎉 What's Been Created

I've set up everything you need to configure Instagram API credentials:

### ✅ New Scripts

1. **`scripts/setup-instagram-api.mjs`** ⭐ **START HERE**
   - Interactive setup wizard
   - Guides you through every step
   - Auto-fetches User ID
   - Tests credentials automatically
   - Saves everything to `.env.local`

2. **`scripts/test-instagram-api.mjs`**
   - Tests your Instagram API credentials
   - Verifies connection
   - Checks if posts can be fetched
   - Shows token expiry status

### ✅ Documentation

1. **`INSTAGRAM_API_QUICKSTART.md`** - Quick 5-minute guide
2. **`INSTAGRAM_API_SETUP_WALKTHROUGH.md`** - Detailed step-by-step
3. **`INSTAGRAM_SETUP_GUIDE.md`** - Complete reference (updated)
4. **`INSTAGRAM_AUTO_FETCH_SETUP.md`** - Auto-refresh configuration

---

## 🚀 How to Get Started

### Option 1: Interactive Setup (Easiest)

```bash
cd web
node scripts/setup-instagram-api.mjs
```

**The script will:**
1. Guide you to Facebook Developer Console
2. Help you get App ID and App Secret
3. Generate Access Token
4. Auto-fetch User ID
5. Save everything to `.env.local`
6. Test the connection

**Time:** ~5 minutes

### Option 2: Manual Setup

Follow: `INSTAGRAM_API_SETUP_WALKTHROUGH.md`

**Time:** ~10-15 minutes

---

## 📋 What You Need

Before starting:

1. **Facebook Developer Account**
   - Sign up: https://developers.facebook.com/
   - Free and takes 2 minutes

2. **Instagram Account**
   - Your profile: `@sergikdropz`
   - Must be connected to Facebook

3. **5-10 minutes** to complete setup

---

## 🎯 Setup Process

### Step 1: Create Facebook App
- Go to: https://developers.facebook.com/apps/
- Create new app → "Consumer" or "Business"
- Name: "SERGIK Website"

### Step 2: Add Instagram Basic Display
- In app dashboard → "Add Products"
- Find "Instagram Basic Display" → "Set Up"
- Configure OAuth redirect URIs

### Step 3: Get Credentials
- **App ID**: From Instagram Basic Display settings
- **App Secret**: Click "Show" to reveal
- **Access Token**: Generate via Graph API Explorer
- **User ID**: Auto-fetched by script

### Step 4: Run Setup Script
```bash
node scripts/setup-instagram-api.mjs
```

Enter your credentials when prompted!

---

## ✅ After Setup

1. **Test your credentials:**
   ```bash
   node scripts/test-instagram-api.mjs
   ```

2. **Restart dev server:**
   ```bash
   npm run dev
   ```

3. **Test refresh:**
   ```bash
   node scripts/refresh-instagram-posts.mjs
   ```

4. **Visit homepage** - Posts should appear!

---

## 🔄 Auto-Refresh (Already Configured!)

Once credentials are set, posts will automatically refresh:

- ✅ **Every 6 hours** via Vercel Cron (if deployed)
- ✅ **Manually** via `/instagram-helper` page
- ✅ **Via script**: `node scripts/refresh-instagram-posts.mjs`

See: `INSTAGRAM_AUTO_FETCH_SETUP.md` for details.

---

## 🧪 Testing

### Test Credentials
```bash
node scripts/test-instagram-api.mjs
```

### Test Refresh
```bash
node scripts/refresh-instagram-posts.mjs
```

### Test API Endpoint
Visit: `http://localhost:3000/api/instagram/posts?username=sergikdropz&limit=6`

---

## 🐛 Troubleshooting

### "Missing credentials"
→ Run setup script again or check `.env.local`

### "Access token expired"
→ Generate new token via Graph API Explorer

### "No posts found"
→ Account might be private or have no posts

### "User ID not found"
→ Enter User ID manually in setup script

---

## 📚 Documentation Guide

| Document | Purpose | When to Use |
|----------|---------|-------------|
| `INSTAGRAM_API_QUICKSTART.md` | Quick overview | First time setup |
| `INSTAGRAM_API_SETUP_WALKTHROUGH.md` | Detailed steps | Manual setup |
| `INSTAGRAM_SETUP_GUIDE.md` | Complete reference | Troubleshooting |
| `INSTAGRAM_AUTO_FETCH_SETUP.md` | Auto-refresh config | After setup |

---

## 🎉 Ready to Start?

```bash
cd web
node scripts/setup-instagram-api.mjs
```

**Follow the prompts and you'll be done in 5 minutes!**

---

## 💡 Pro Tips

1. **Use long-lived tokens** - They last 60 days instead of 1 hour
2. **Set up auto-refresh** - Posts update automatically every 6 hours
3. **Test regularly** - Run test script to check token expiry
4. **Keep credentials secure** - Never commit `.env.local` to Git

---

**Everything is ready! Just run the setup script and follow the prompts! 🚀**

