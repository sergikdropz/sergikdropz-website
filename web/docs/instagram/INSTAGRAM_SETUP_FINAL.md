# 📸 Instagram API Setup - Final Instructions

## Current Status

✅ **Saved to `.env.local`:**
- App ID: `1186575606889765`
- App Secret: `c58e867a7ac7b380491aded06d536fad`
- Access Token: (Facebook token - needs Instagram token)

⚠️ **Still Needed:**
- Instagram-specific Access Token (with `instagram_basic` permission)
- Instagram User ID

## The Problem

The tokens you've provided are **Facebook Graph API tokens**, but Instagram Basic Display API requires **Instagram-specific tokens** that work with `graph.instagram.com`.

## Solution: Get Instagram Token via OAuth

Instagram Basic Display API requires an OAuth flow, not just a token from Graph API Explorer.

### Step 1: Set Up OAuth Redirect URI

1. Go to: https://developers.facebook.com/apps/1186575606889765
2. Navigate to: **Instagram Basic Display** → **Basic Display**
3. Add OAuth Redirect URIs:
   - `http://localhost:3000/api/instagram/callback`
   - `https://yourdomain.com/api/instagram/callback` (your production domain)

### Step 2: Generate OAuth URL

Use this URL (replace `YOUR_APP_ID` with `1186575606889765`):

```
https://api.instagram.com/oauth/authorize?client_id=1186575606889765&redirect_uri=http://localhost:3000/api/instagram/callback&scope=user_profile,user_media&response_type=code
```

### Step 3: Authorize and Get Code

1. Visit the URL above in your browser
2. Authorize the app
3. You'll be redirected to: `http://localhost:3000/api/instagram/callback?code=XXXXX`
4. Copy the `code` parameter

### Step 4: Exchange Code for Token

I can create an API route to handle this, or you can use this curl command:

```bash
curl -X POST \
  "https://api.instagram.com/oauth/access_token" \
  -F "client_id=1186575606889765" \
  -F "client_secret=c58e867a7ac7b380491aded06d536fad" \
  -F "grant_type=authorization_code" \
  -F "redirect_uri=http://localhost:3000/api/instagram/callback" \
  -F "code=YOUR_CODE_HERE"
```

This will return:
- `access_token` - Your Instagram token
- `user_id` - Your Instagram User ID

### Step 5: Exchange for Long-Lived Token

The token from Step 4 is short-lived (1 hour). Exchange it for a long-lived token (60 days):

```bash
curl "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=c58e867a7ac7b380491aded06d536fad&access_token=YOUR_SHORT_LIVED_TOKEN"
```

## Alternative: Use Manual Posts (Works Now!)

While you set up the Instagram token, you can use manual post URLs:

1. Visit: `http://localhost:3000/instagram-helper`
2. Add your Instagram post URLs manually
3. They'll display immediately!

This works right away and doesn't require API setup.

## Quick Reference

- **App ID**: `1186575606889765`
- **App Secret**: `c58e867a7ac7b380491aded06d536fad`
- **OAuth URL**: `https://api.instagram.com/oauth/authorize?client_id=1186575606889765&redirect_uri=http://localhost:3000/api/instagram/callback&scope=user_profile,user_media&response_type=code`

---

**For now, use manual posts via `/instagram-helper` - it works immediately!**

