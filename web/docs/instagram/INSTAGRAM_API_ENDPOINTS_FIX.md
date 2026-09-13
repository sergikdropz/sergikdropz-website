# 🔧 Instagram API Endpoints Fix

## ⚠️ Error You're Seeing

```
Invalid OAuth access token - Cannot parse access token
```

## Root Cause

You're trying to use:
- `graph.instagram.com/me` endpoint (doesn't exist for Instagram Graph API)
- Facebook access token with only `public_profile` permission
- Wrong endpoint structure

## ✅ Correct Instagram Graph API Usage

### 1. Get Instagram Business Account ID

Instagram Graph API requires you to get the Instagram Business Account ID through a Facebook Page:

```bash
# Step 1: Get your Facebook Pages
GET https://graph.facebook.com/v18.0/me/accounts?access_token=YOUR_TOKEN

# Step 2: Get Instagram Business Account from a Page
GET https://graph.facebook.com/v18.0/{page-id}?fields=instagram_business_account{id,username}&access_token=YOUR_TOKEN
```

### 2. Get Media from Instagram Business Account

```bash
# Use the Instagram Business Account ID (not /me)
GET https://graph.facebook.com/v18.0/{instagram-business-account-id}/media?
  fields=id,media_type,media_url,permalink,timestamp,caption
  &access_token=YOUR_TOKEN
  &limit=12
```

### 3. Required Permissions

Your access token needs these permissions:
- ✅ `instagram_graph_user_profile`
- ✅ `instagram_graph_user_media`
- ✅ `pages_read_engagement` (to access Facebook Pages)

**NOT** just `public_profile` - that's a Facebook permission, not Instagram.

## 🔄 What Changed in the Code

I've updated all API calls to use:
- ✅ `https://graph.facebook.com/v18.0/` (correct)
- ❌ `https://graph.instagram.com/` (deprecated/wrong)

## 📋 Correct OAuth Flow

1. **Authorization URL:**
   ```
   https://www.facebook.com/v18.0/dialog/oauth?
     client_id=YOUR_APP_ID
     &redirect_uri=YOUR_REDIRECT_URI
     &scope=instagram_graph_user_profile,instagram_graph_user_media,pages_read_engagement
     &response_type=code
   ```

2. **Exchange Code for Token:**
   ```
   GET https://graph.facebook.com/v18.0/oauth/access_token?
     client_id=YOUR_APP_ID
     &client_secret=YOUR_APP_SECRET
     &redirect_uri=YOUR_REDIRECT_URI
     &code=YOUR_CODE
   ```

3. **Get Instagram Business Account ID:**
   ```
   GET https://graph.facebook.com/v18.0/me/accounts?access_token=TOKEN
   GET https://graph.facebook.com/v18.0/{page-id}?fields=instagram_business_account{id,username}&access_token=TOKEN
   ```

4. **Get Media:**
   ```
   GET https://graph.facebook.com/v18.0/{instagram-business-account-id}/media?
     fields=id,media_type,media_url,permalink,timestamp,caption
     &access_token=TOKEN
     &limit=12
   ```

## ⚠️ Important Notes

1. **No `/me` endpoint** - Instagram Graph API doesn't support `/me` like Facebook Graph API
2. **Must use Instagram Business Account ID** - Get it through Facebook Page connection
3. **Use `graph.facebook.com`** - Not `graph.instagram.com` for Graph API
4. **Business/Creator account required** - Personal accounts won't work

## 🚀 Next Steps

1. Make sure your OAuth flow requests the correct permissions
2. Get the Instagram Business Account ID from your Facebook Page
3. Use that ID in all API calls (not `/me`)
4. All endpoints should use `graph.facebook.com/v18.0/`

The code has been updated to use the correct endpoints. You just need to ensure:
- ✅ You have Instagram Business/Creator account
- ✅ Instagram account is connected to Facebook Page
- ✅ OAuth flow requests correct permissions
- ✅ You're using the Instagram Business Account ID (not `/me`)

