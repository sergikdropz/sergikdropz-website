# Instagram API Setup Guide

This guide will help you set up Instagram API integration to automatically fetch and display your recent Instagram posts on your website.

## ⚡ Quick Start (Recommended)

**Fastest way - run the interactive setup script:**

```bash
cd web
node scripts/setup-instagram-api.mjs
```

The script will guide you through all steps automatically! See `INSTAGRAM_API_QUICKSTART.md` for details.

---

## 📋 Manual Setup

If you prefer to set up manually, follow the steps below:

## Option 1: Manual Post URLs (Easiest - No API Required)

If you don't want to set up the Instagram API, you can manually add post URLs:

1. **Open `web/data/instagram-posts.json`**
2. **Get your Instagram post URLs:**
   - Open Instagram (web or app)
   - Navigate to a post you want to display
   - Click the three dots (⋯) menu
   - Select "Copy link"
   - Paste the URL into the `posts` array

3. **Example:**
```json
{
  "username": "sergikdropz",
  "posts": [
    "https://www.instagram.com/p/ABC123xyzDEF/",
    "https://www.instagram.com/p/DEF456uvwGHI/",
    "https://www.instagram.com/p/GHI789rstJKL/"
  ]
}
```

**That's it!** Your posts will appear on the homepage automatically.

---

## Option 2: Instagram API (Automatic - Requires Setup)

If you want posts to automatically update, set up Instagram Basic Display API:

### Step 1: Create a Facebook App

1. Go to https://developers.facebook.com/apps/
2. Click "Create App"
3. Select "Consumer" or "Business" as app type
4. Fill in app details:
   - App Name: "SERGIK Website" (or your choice)
   - App Contact Email: your email
5. Click "Create App"

### Step 2: Add Instagram Basic Display Product

1. In your app dashboard, go to "Add Products"
2. Find "Instagram Basic Display" and click "Set Up"
3. You'll see the product added to your app

### Step 3: Configure Instagram Basic Display

1. Go to **Instagram Basic Display** → **Basic Display** in the left sidebar
2. Click "Create New App"
3. Add OAuth Redirect URIs:
   - For local development: `http://localhost:3000/api/instagram/callback`
   - For production: `https://yourdomain.com/api/instagram/callback`
4. Add Deauthorize Callback URL:
   - `http://localhost:3000/api/instagram/deauthorize`
   - `https://yourdomain.com/api/instagram/deauthorize`
5. Add Data Deletion Request URL (optional):
   - `http://localhost:3000/api/instagram/delete`

### Step 4: Get Your Credentials

1. In **Instagram Basic Display** → **Basic Display**, you'll see:
   - **App ID** (copy this)
   - **App Secret** (click "Show" and copy this)

2. Add these to `web/.env.local`:
```bash
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
```

### Step 5: Generate Access Token

#### Method A: Using Facebook Graph API Explorer (Easiest)

1. Go to https://developers.facebook.com/tools/explorer/
2. Select your app from the dropdown
3. Click "Generate Access Token"
4. Select permissions: `instagram_basic`, `pages_read_engagement`
5. Copy the access token
6. Add to `.env.local`:
```bash
INSTAGRAM_ACCESS_TOKEN=your_access_token_here
```

#### Method B: Using OAuth Flow (More Secure)

1. Create an OAuth authorization URL:
```
https://api.instagram.com/oauth/authorize?client_id=YOUR_APP_ID&redirect_uri=YOUR_REDIRECT_URI&scope=user_profile,user_media&response_type=code
```

2. Replace:
   - `YOUR_APP_ID` with your App ID
   - `YOUR_REDIRECT_URI` with your redirect URI (e.g., `http://localhost:3000/api/instagram/callback`)

3. Visit the URL in your browser
4. Authorize the app
5. You'll be redirected with a code
6. Exchange the code for an access token (you may need to create an API route for this)

### Step 6: Get Your User ID

1. Use the Graph API Explorer: https://developers.facebook.com/tools/explorer/
2. Select your app
3. Use the access token from Step 5
4. Make a GET request to: `me?fields=id`
5. Copy the `id` value
6. Add to `.env.local`:
```bash
INSTAGRAM_USER_ID=your_user_id_here
```

### Step 7: Test the Integration

1. Make sure all credentials are in `web/.env.local`
2. Restart your development server:
```bash
cd web
npm run dev
```

3. Visit your homepage - Instagram posts should load automatically!

---

## Troubleshooting

### Posts Not Showing?

1. **Check your `.env.local` file:**
   - Make sure all Instagram variables are set
   - No extra spaces or quotes around values

2. **Check the API route:**
   - Visit: `http://localhost:3000/api/instagram/posts?username=sergikdropz&limit=6`
   - You should see JSON with posts or an error message

3. **Check browser console:**
   - Look for any JavaScript errors
   - Check Network tab for failed requests

4. **Verify Access Token:**
   - Instagram access tokens expire after 60 days
   - You may need to refresh your token
   - Use long-lived tokens for production

### Access Token Expired?

Instagram access tokens expire. To get a long-lived token:

1. Exchange your short-lived token for a long-lived one:
```
GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=YOUR_APP_SECRET&access_token=YOUR_SHORT_LIVED_TOKEN
```

2. Update `INSTAGRAM_ACCESS_TOKEN` in `.env.local` with the new token

---

## Security Notes

- **Never commit `.env.local` to Git** (it's already in `.gitignore`)
- **Keep your App Secret secure** - don't share it publicly
- **Use environment variables in production** (Vercel, Netlify, etc.)
- **Rotate tokens regularly** for better security

---

## Fallback Behavior

The system is designed to gracefully fall back:

1. **First:** Tries Instagram API (if credentials are set)
2. **Second:** Uses post URLs from `instagram-posts.json`
3. **Third:** Shows a message with link to Instagram profile

This ensures your site always works, even if the API is unavailable!

