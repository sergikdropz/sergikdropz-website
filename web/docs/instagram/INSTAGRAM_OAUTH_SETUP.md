# 🔗 Instagram OAuth Setup - Complete Guide

## ✅ What's Been Set Up

I've created a complete OAuth flow for Instagram API setup!

### New Features:

1. **OAuth Callback Handler** (`/api/instagram/callback`)
   - Handles Instagram OAuth redirect
   - Exchanges code for access token
   - Automatically exchanges for long-lived token (60 days)
   - Saves credentials to `.env.local`

2. **OAuth Connect Button** (on `/instagram-helper` page)
   - One-click Instagram account connection
   - Handles the entire OAuth flow
   - Automatically saves credentials

## 🚀 How to Use (Easiest Method)

### Step 1: Configure OAuth Redirect URI

1. Go to: https://developers.facebook.com/apps/1186575606889765
2. Navigate to: **Instagram Basic Display** → **Basic Display**
3. Add OAuth Redirect URIs:
   - `http://localhost:3000/api/instagram/callback` (for development)
   - `https://yourdomain.com/api/instagram/callback` (for production)
4. Click **"Save Changes"**

### Step 2: Connect Your Account

1. **Start your dev server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Visit the helper page:**
   ```
   http://localhost:3000/instagram-helper
   ```

3. **Click "🔗 Connect Instagram Account"**
   - This will redirect you to Instagram
   - Authorize the app
   - You'll be redirected back automatically
   - Credentials will be saved!

4. **Done!** Your Instagram posts will now auto-fetch!

## 📋 What Happens During OAuth

1. You click "Connect Instagram Account"
2. Redirected to Instagram authorization page
3. You authorize the app
4. Instagram redirects back with a `code`
5. Our callback handler:
   - Exchanges code for access token
   - Gets your User ID
   - Exchanges for long-lived token (60 days)
   - Saves everything to `.env.local`
6. You're redirected back with success message

## ✅ After OAuth Success

Once connected, you can:

1. **Refresh posts manually:**
   - Click "🔄 Refresh from Instagram API" on helper page

2. **Auto-refresh (already configured):**
   - Posts refresh every 6 hours via Vercel Cron
   - Or set up external cron service

3. **Test it:**
   ```bash
   node scripts/refresh-instagram-posts.mjs
   ```

## 🐛 Troubleshooting

### "Redirect URI mismatch"
- Make sure you added the exact redirect URI to Facebook app settings
- Must match: `http://localhost:3000/api/instagram/callback` (for dev)

### "App not approved"
- Your app is in development mode
- Add test users in Facebook App Settings → Roles → Test Users
- Or submit app for review (for production)

### "Invalid OAuth access token"
- Token may have expired
- Re-connect using the OAuth button
- Long-lived tokens last 60 days

## 📚 Alternative: Manual Setup

If OAuth doesn't work, you can still:
1. Use manual post URLs via `/instagram-helper`
2. Or follow `INSTAGRAM_SETUP_FINAL.md` for manual token setup

---

**The OAuth flow is the easiest way - just click the button and authorize! 🎉**

