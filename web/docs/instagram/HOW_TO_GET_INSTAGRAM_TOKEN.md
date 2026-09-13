# 🔑 How to Get Instagram Access Token

## ⚠️ Important: Account Type Required

**You need an Instagram Business or Creator account** (not a personal account) to use Instagram Graph API.

If you have a personal account:
1. Convert it to Business/Creator: Instagram App → Settings → Account Type → Switch to Business/Creator
2. Or use the manual post URL method (no API needed)

---

## 🚀 Method 1: Use Instagram Helper Page (Easiest)

This is the **easiest way** if you have a Business/Creator account:

1. **Start your Next.js server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Open Instagram Helper:**
   ```
   http://localhost:3000/instagram-helper
   ```

3. **Click "🔗 Connect Instagram Account"**
   - This will handle OAuth automatically
   - It will save credentials to `.env.local` for you

4. **Done!** The token and user ID will be saved automatically.

---

## 📋 Method 2: Manual Setup via Facebook Developers

### Step 1: Create/Select Facebook App

1. Go to: **https://developers.facebook.com/apps/**
2. Click **"Create App"** (or select existing app)
3. Choose **"Business"** as app type
4. Fill in app details and create

### Step 2: Add Instagram Graph API Product

1. In your app dashboard, click **"Add Product"**
2. Find **"Instagram Graph API"** and click **"Set Up"**
3. You'll see it added to your app

### Step 3: Configure Instagram Graph API

1. Go to **Instagram Graph API** → **Basic Display** (or **Settings**)
2. Add **OAuth Redirect URIs:**
   - `http://localhost:3000/api/instagram/callback`
   - `https://yourdomain.com/api/instagram/callback` (for production)
3. Click **"Save Changes"**

### Step 4: Get App ID and App Secret

1. Still in **Instagram Graph API** → **Basic Display**
2. You'll see:
   - **App ID** - Copy this
   - **App Secret** - Click **"Show"** and copy it

### Step 5: Generate Access Token

#### Option A: Graph API Explorer (Quick Test)

1. Go to: **https://developers.facebook.com/tools/explorer/**
2. In the top right, select your app from the dropdown
3. Click **"Generate Access Token"**
4. Select permissions:
   - ✅ `instagram_graph_user_profile`
   - ✅ `instagram_graph_user_media`
   - ✅ `pages_read_engagement` (if you have a Facebook Page)
5. Click **"Generate Access Token"**
6. **Copy the token** - this is your `INSTAGRAM_ACCESS_TOKEN`

**⚠️ Note:** This token expires in 1-2 hours. For production, you need a long-lived token (see below).

#### Option B: OAuth Flow (Production - Long-Lived Token)

1. **Create OAuth URL:**
   ```
   https://www.facebook.com/v18.0/dialog/oauth?
     client_id=YOUR_APP_ID
     &redirect_uri=http://localhost:3000/api/instagram/callback
     &scope=instagram_graph_user_profile,instagram_graph_user_media
     &response_type=code
   ```

2. **Replace `YOUR_APP_ID`** with your App ID from Step 4

3. **Visit the URL** in your browser

4. **Authorize the app**

5. **You'll be redirected** to: `http://localhost:3000/api/instagram/callback?code=XXXXX`

6. **Copy the `code` parameter**

7. **Exchange code for token:**
   ```bash
   curl -X GET \
     "https://graph.facebook.com/v18.0/oauth/access_token?\
     client_id=YOUR_APP_ID&\
     client_secret=YOUR_APP_SECRET&\
     redirect_uri=http://localhost:3000/api/instagram/callback&\
     code=YOUR_CODE"
   ```

8. **This returns:**
   ```json
   {
     "access_token": "YOUR_SHORT_LIVED_TOKEN",
     "token_type": "bearer"
   }
   ```

9. **Exchange for long-lived token:**
   ```bash
   curl -X GET \
     "https://graph.facebook.com/v18.0/oauth/access_token?\
     grant_type=fb_exchange_token&\
     client_id=YOUR_APP_ID&\
     client_secret=YOUR_APP_SECRET&\
     fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
   ```

10. **This returns a long-lived token** (expires in 60 days)

### Step 6: Get Your Instagram User ID

1. Go to: **https://developers.facebook.com/tools/explorer/**
2. Select your app
3. Use the access token from Step 5
4. Make a GET request to: `me/accounts?fields=instagram_business_account{id,username}`
5. Look for the `id` in the `instagram_business_account` object
6. **Copy this ID** - this is your `INSTAGRAM_USER_ID`

**Alternative:** If you have a Facebook Page connected to Instagram:
1. Make request to: `me/accounts`
2. Find your page
3. Make request to: `{page_id}?fields=instagram_business_account{id,username}`
4. Copy the `id` from `instagram_business_account`

### Step 7: Add to `.env.local`

Add these to `web/.env.local`:

```bash
INSTAGRAM_ACCESS_TOKEN=your_access_token_here
INSTAGRAM_USER_ID=your_user_id_here
```

---

## ✅ Verify It Works

Test your credentials:

```bash
cd web
node scripts/fetch-instagram-video-urls.mjs
```

Or test the API directly:

```bash
curl "https://graph.instagram.com/YOUR_USER_ID/media?fields=id,media_type,media_url,permalink&access_token=YOUR_ACCESS_TOKEN"
```

---

## 🔄 Token Expiration

- **Short-lived tokens:** Expire in 1-2 hours
- **Long-lived tokens:** Expire in 60 days
- **For production:** Set up token refresh or use the OAuth callback route

---

## 💡 Quick Reference

**What you need:**
- ✅ Instagram Business or Creator account
- ✅ Facebook App with Instagram Graph API
- ✅ App ID and App Secret
- ✅ Access Token (with `instagram_graph_user_profile` and `instagram_graph_user_media` permissions)
- ✅ Instagram User ID

**Where to find:**
- **App ID/Secret:** Facebook Developers → Your App → Instagram Graph API → Basic Display
- **Access Token:** Graph API Explorer or OAuth flow
- **User ID:** Graph API Explorer → `me/accounts?fields=instagram_business_account{id}`

---

## 🆘 Troubleshooting

**"Invalid OAuth access token"**
- Token expired (get a new one)
- Wrong permissions (need `instagram_graph_user_profile` and `instagram_graph_user_media`)

**"User ID not found"**
- Make sure your Instagram account is connected to a Facebook Page
- Check that you're using the Instagram Business Account ID, not Facebook User ID

**"App not approved"**
- For production, you may need to submit your app for review
- For development, add yourself as a test user in App Settings → Roles

---

**Once you have the token and user ID, add them to `.env.local` and run:**
```bash
node scripts/fetch-and-download-instagram-videos.mjs
```

