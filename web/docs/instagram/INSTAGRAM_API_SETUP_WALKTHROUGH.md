# 📸 Instagram API Setup - Step-by-Step Walkthrough

This guide will walk you through setting up Instagram API credentials from scratch.

## 🎯 Quick Setup (Automated)

**Easiest way - run the interactive script:**

```bash
cd web
node scripts/setup-instagram-api.mjs
```

The script will guide you through each step!

---

## 📋 Manual Setup (Step-by-Step)

If you prefer to do it manually, follow these steps:

### Step 1: Create Facebook Developer Account

1. Go to: https://developers.facebook.com/
2. Click "Get Started" or "Log In"
3. Complete the registration if needed

### Step 2: Create a Facebook App

1. Go to: https://developers.facebook.com/apps/
2. Click **"Create App"** button (top right)
3. Select app type:
   - Choose **"Consumer"** or **"Business"**
   - Click **"Next"**
4. Fill in app details:
   - **App Name**: "SERGIK Website" (or your choice)
   - **App Contact Email**: your email address
   - **Business Account** (optional): Skip if you don't have one
5. Click **"Create App"**

### Step 3: Add Instagram Basic Display Product

1. In your app dashboard, look for **"Add Products"** section
2. Find **"Instagram Basic Display"** in the list
3. Click **"Set Up"** button next to it
4. You'll see it added to your app

### Step 4: Configure Instagram Basic Display

1. In the left sidebar, click **"Instagram Basic Display"**
2. Click **"Basic Display"** (under Instagram Basic Display)
3. You'll see configuration options:

   **OAuth Redirect URIs:**
   - Click **"Add or Remove Redirect URIs"**
   - Add: `http://localhost:3000/api/instagram/callback`
   - Add: `https://yourdomain.com/api/instagram/callback` (replace with your domain)
   - Click **"Save Changes"**

   **Deauthorize Callback URL:**
   - Add: `http://localhost:3000/api/instagram/deauthorize`
   - Add: `https://yourdomain.com/api/instagram/deauthorize`
   - Click **"Save Changes"**

   **Data Deletion Request URL (optional):**
   - Add: `http://localhost:3000/api/instagram/delete`
   - Add: `https://yourdomain.com/api/instagram/delete`

### Step 5: Get Your App ID and App Secret

1. Still in **Instagram Basic Display → Basic Display**
2. You'll see:
   - **App ID** - Copy this (it's visible)
   - **App Secret** - Click **"Show"** and copy it

**⚠️ Important:** Keep your App Secret secure! Never share it publicly.

### Step 6: Generate Access Token

#### Option A: Graph API Explorer (Easiest)

1. Go to: https://developers.facebook.com/tools/explorer/
2. In the top right, select your app from the dropdown
3. Click **"Generate Access Token"** button
4. Select permissions:
   - ✅ `instagram_basic`
   - ✅ `pages_read_engagement`
5. Click **"Generate Access Token"**
6. **Copy the token** - you'll need it!

**Note:** This token expires in 1 hour. For production, you'll need a long-lived token (see below).

#### Option B: OAuth URL (More Secure)

1. Create this URL (replace `YOUR_APP_ID`):
```
https://api.instagram.com/oauth/authorize?client_id=YOUR_APP_ID&redirect_uri=http://localhost:3000/api/instagram/callback&scope=user_profile,user_media&response_type=code
```

2. Visit the URL in your browser
3. Authorize the app
4. You'll be redirected with a `code` parameter
5. Exchange the code for a token (you may need to create an API route for this)

### Step 7: Get Your User ID

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app
3. Use the access token from Step 6
4. In the API endpoint field, enter: `me?fields=id`
5. Click **"Submit"**
6. Copy the `id` value from the response

**OR** use the auto-fetch feature in the setup script!

### Step 8: Exchange for Long-Lived Token (Recommended)

Short-lived tokens expire in 1 hour. For production, get a long-lived token (valid 60 days):

1. Make a GET request to:
```
https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=YOUR_APP_SECRET&access_token=YOUR_SHORT_LIVED_TOKEN
```

2. Replace:
   - `YOUR_APP_SECRET` with your App Secret
   - `YOUR_SHORT_LIVED_TOKEN` with your short-lived token

3. The response will include a new `access_token` (long-lived)
4. Use this token instead of the short-lived one

### Step 9: Add Credentials to .env.local

1. Open `web/.env.local` (create it if it doesn't exist)
2. Add these lines:

```bash
# Instagram API Configuration
INSTAGRAM_APP_ID=your_app_id_here
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_ACCESS_TOKEN=your_access_token_here
INSTAGRAM_USER_ID=your_user_id_here
```

3. Replace the placeholder values with your actual credentials
4. **Save the file**

### Step 10: Test Your Setup

Run the test script:

```bash
cd web
node scripts/test-instagram-api.mjs
```

If everything works, you'll see:
- ✅ All credentials found
- ✅ User info retrieved
- ✅ Posts fetched successfully

---

## 🔄 Refreshing Your Token

Instagram access tokens expire after 60 days. To refresh:

1. Use the same exchange endpoint from Step 8
2. Or use the Graph API Explorer to generate a new token
3. Update `INSTAGRAM_ACCESS_TOKEN` in `.env.local`

---

## 🐛 Troubleshooting

### "Invalid OAuth Access Token"

- Your token may have expired
- Generate a new token using Graph API Explorer
- Make sure you're using a long-lived token for production

### "App Not Approved"

- Your app is in development mode
- Add test users in Facebook App Settings
- Or submit your app for review (for production use)

### "No Posts Found"

- Your Instagram account might be private
- Make sure you've posted content
- Check that your app has the correct permissions

### "User ID Not Found"

- Make sure you're using the correct User ID
- Try fetching it again using Graph API Explorer
- Verify your access token is valid

---

## ✅ Success Checklist

- [ ] Facebook Developer account created
- [ ] Facebook App created
- [ ] Instagram Basic Display product added
- [ ] OAuth redirect URIs configured
- [ ] App ID and App Secret obtained
- [ ] Access token generated
- [ ] User ID obtained
- [ ] Long-lived token exchanged (optional but recommended)
- [ ] Credentials added to `.env.local`
- [ ] Test script passes
- [ ] Posts appear on homepage

---

## 📚 Additional Resources

- **Full Setup Guide**: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`
- **Auto-Fetch Setup**: `web/docs/instagram/INSTAGRAM_AUTO_FETCH_SETUP.md`
- **Facebook Developer Docs**: https://developers.facebook.com/docs/instagram-basic-display-api

---

**Need help?** Run the interactive setup script:
```bash
node scripts/setup-instagram-api.mjs
```

