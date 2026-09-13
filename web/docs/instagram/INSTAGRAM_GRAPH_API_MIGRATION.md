# 🔄 Instagram Graph API Migration Guide

## ⚠️ Important: Instagram Basic Display API Deprecated

**Instagram Basic Display API was deprecated on December 4, 2024** and is no longer available.

We've migrated to **Instagram Graph API**, which is the replacement.

## Key Differences

### Instagram Basic Display API (Deprecated)
- ❌ No longer available
- ❌ Worked with personal accounts
- ❌ Used `api.instagram.com` endpoints
- ❌ Scopes: `user_profile,user_media`

### Instagram Graph API (Current)
- ✅ Currently available
- ✅ Requires **Instagram Business or Creator account**
- ✅ Uses `graph.facebook.com` endpoints
- ✅ Scopes: `instagram_graph_user_profile,instagram_graph_user_media`
- ✅ Requires Facebook Page connected to Instagram account

## Requirements

1. **Instagram Business or Creator Account**
   - Personal accounts won't work
   - Convert in Instagram App → Settings → Account Type

2. **Facebook Page Connected to Instagram**
   - Your Instagram account must be connected to a Facebook Page
   - Connect in Instagram App → Settings → Linked Accounts → Facebook

3. **Facebook App Configuration**
   - Add "Instagram Graph API" product (not "Instagram Basic Display")
   - Configure OAuth Redirect URIs
   - App must be in Development or Live mode

## Updated OAuth Flow

### Authorization URL
```
https://www.facebook.com/v18.0/dialog/oauth?
  client_id=YOUR_APP_ID
  &redirect_uri=YOUR_REDIRECT_URI
  &scope=instagram_graph_user_profile,instagram_graph_user_media,pages_read_engagement
  &response_type=code
```

### Token Exchange
```
GET https://graph.facebook.com/v18.0/oauth/access_token?
  client_id=YOUR_APP_ID
  &client_secret=YOUR_APP_SECRET
  &redirect_uri=YOUR_REDIRECT_URI
  &code=YOUR_CODE
```

### Long-Lived Token Exchange
```
GET https://graph.facebook.com/v18.0/oauth/access_token?
  grant_type=fb_exchange_token
  &client_id=YOUR_APP_ID
  &client_secret=YOUR_APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN
```

### Get Instagram Business Account ID
```
GET https://graph.facebook.com/v18.0/me/accounts?access_token=TOKEN
GET https://graph.facebook.com/v18.0/{page_id}?fields=instagram_business_account{id,username}&access_token=TOKEN
```

## Setup Steps

1. **Convert Instagram Account** (if needed)
   - Instagram App → Settings → Account Type → Switch to Business/Creator

2. **Connect to Facebook Page**
   - Instagram App → Settings → Linked Accounts → Facebook
   - Connect your Facebook Page

3. **Configure Facebook App**
   - Go to: https://developers.facebook.com/apps/1186575606889765
   - Add "Instagram Graph API" product
   - Go to Instagram Graph API → Basic Display
   - Add OAuth Redirect URI: `http://localhost:3000/api/instagram/callback`
   - Save changes

4. **Connect Account**
   - Visit: `http://localhost:3000/instagram-helper`
   - Click "🔗 Connect Instagram Account"
   - Authorize the app
   - Done! ✅

## API Endpoints

### Get User Media
```
GET https://graph.facebook.com/v18.0/{instagram-user-id}/media?
  fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp
  &access_token=TOKEN
```

### Get User Profile
```
GET https://graph.facebook.com/v18.0/{instagram-user-id}?
  fields=id,username,account_type
  &access_token=TOKEN
```

## Troubleshooting

### "Invalid platform app" Error
- Make sure "Instagram Graph API" product is added (not "Instagram Basic Display")
- Verify OAuth Redirect URI is configured

### "User not authorized" Error
- Make sure you have an Instagram Business or Creator account
- Verify your Instagram account is connected to a Facebook Page

### "Page not found" Error
- Make sure your Instagram account is connected to a Facebook Page
- Verify the Facebook Page exists and is accessible

## More Information

- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api/)
- [Migration Guide](https://developers.facebook.com/docs/instagram-api/overview/)
- [Account Requirements](https://developers.facebook.com/docs/instagram-api/getting-started/)

