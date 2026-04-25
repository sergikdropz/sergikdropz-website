# ✅ Correct Instagram Graph API Usage

## ❌ What Doesn't Work

```javascript
// ❌ WRONG - Instagram Graph API doesn't support /me
FB.api('/me', 'GET', {
  "fields": "id,name,website,token_for_business,feed,photos{images,picture,album},videos{embeddable,embed_html,collaborators,crosspost_shared_pages{website,video_reels}}"
}, function(response) {
  // This will fail - /me doesn't work for Instagram
});
```

## ✅ Correct Approach

Instagram Graph API requires a **3-step process**:

### Step 1: Get Your Facebook Pages

```javascript
FB.api('/me/accounts', 'GET', {
  "fields": "id,name,access_token"
}, function(response) {
  if (response.data && response.data.length > 0) {
    const pageId = response.data[0].id;
    // Go to Step 2
  }
});
```

### Step 2: Get Instagram Business Account from Page

```javascript
FB.api(`/${pageId}`, 'GET', {
  "fields": "instagram_business_account{id,username}"
}, function(response) {
  if (response.instagram_business_account) {
    const instagramAccountId = response.instagram_business_account.id;
    // Go to Step 3
  }
});
```

### Step 3: Get Instagram Media

```javascript
FB.api(`/${instagramAccountId}/media`, 'GET', {
  "fields": "id,media_type,media_url,permalink,thumbnail_url,timestamp,caption",
  "limit": 12
}, function(response) {
  if (response.data) {
    // Success! response.data contains your Instagram posts
    console.log(response.data);
  }
});
```

## 🔄 Complete Example

```javascript
// Step 1: Get Facebook Pages
FB.api('/me/accounts', 'GET', {
  "fields": "id,name"
}, function(pagesResponse) {
  if (pagesResponse.error) {
    console.error('Error getting pages:', pagesResponse.error);
    return;
  }
  
  if (!pagesResponse.data || pagesResponse.data.length === 0) {
    console.error('No Facebook Pages found. Connect Instagram to a Facebook Page first.');
    return;
  }
  
  const pageId = pagesResponse.data[0].id;
  
  // Step 2: Get Instagram Business Account
  FB.api(`/${pageId}`, 'GET', {
    "fields": "instagram_business_account{id,username}"
  }, function(instagramResponse) {
    if (instagramResponse.error) {
      console.error('Error getting Instagram account:', instagramResponse.error);
      return;
    }
    
    if (!instagramResponse.instagram_business_account) {
      console.error('No Instagram Business Account found. Connect Instagram to this Facebook Page.');
      return;
    }
    
    const instagramAccountId = instagramResponse.instagram_business_account.id;
    const instagramUsername = instagramResponse.instagram_business_account.username;
    
    console.log(`Found Instagram Account: @${instagramUsername} (ID: ${instagramAccountId})`);
    
    // Step 3: Get Instagram Media
    FB.api(`/${instagramAccountId}/media`, 'GET', {
      "fields": "id,media_type,media_url,permalink,thumbnail_url,timestamp,caption",
      "limit": 12
    }, function(mediaResponse) {
      if (mediaResponse.error) {
        console.error('Error getting media:', mediaResponse.error);
        return;
      }
      
      if (mediaResponse.data) {
        console.log('Instagram Posts:', mediaResponse.data);
        // Use mediaResponse.data here
      }
    });
  });
});
```

## 📋 Using Fetch API (Not Facebook SDK)

If you're using `fetch` instead of Facebook SDK:

```javascript
const accessToken = 'YOUR_ACCESS_TOKEN';

// Step 1: Get Facebook Pages
const pagesResponse = await fetch(
  `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
);
const pagesData = await pagesResponse.json();
const pageId = pagesData.data[0].id;

// Step 2: Get Instagram Business Account
const instagramResponse = await fetch(
  `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${accessToken}`
);
const instagramData = await instagramResponse.json();
const instagramAccountId = instagramData.instagram_business_account.id;

// Step 3: Get Instagram Media
const mediaResponse = await fetch(
  `https://graph.facebook.com/v18.0/${instagramAccountId}/media?fields=id,media_type,media_url,permalink,thumbnail_url,timestamp,caption&access_token=${accessToken}&limit=12`
);
const mediaData = await mediaResponse.json();
console.log('Instagram Posts:', mediaData.data);
```

## ⚠️ Important Notes

1. **No `/me` for Instagram** - Instagram Graph API doesn't support `/me` endpoint
2. **Must use Instagram Business Account ID** - Get it through Facebook Page
3. **Instagram Business/Creator account required** - Personal accounts won't work
4. **Facebook Page connection required** - Instagram must be connected to a Facebook Page
5. **Use `graph.facebook.com`** - Not `graph.instagram.com` for Graph API

## 🔑 Required Permissions

Your access token needs:
- ✅ `instagram_graph_user_profile`
- ✅ `instagram_graph_user_media`
- ✅ `pages_read_engagement` (to access Facebook Pages)

## 📚 Available Instagram Fields

For Instagram media, you can request:
- `id` - Media ID
- `media_type` - IMAGE, VIDEO, or CAROUSEL_ALBUM
- `media_url` - Direct URL to the media
- `permalink` - Link to the Instagram post
- `thumbnail_url` - Thumbnail URL (for videos)
- `timestamp` - When the post was created
- `caption` - Post caption
- `username` - Instagram username (when getting account info)

**Note:** Fields like `feed`, `photos`, `videos`, `token_for_business` are **Facebook fields**, not Instagram fields. They don't exist for Instagram Graph API.

## 🚀 Quick Test

Test if you have the right setup:

```bash
# 1. Get your pages
curl "https://graph.facebook.com/v18.0/me/accounts?access_token=YOUR_TOKEN"

# 2. Get Instagram account from page
curl "https://graph.facebook.com/v18.0/{page-id}?fields=instagram_business_account{id,username}&access_token=YOUR_TOKEN"

# 3. Get Instagram media
curl "https://graph.facebook.com/v18.0/{instagram-account-id}/media?fields=id,permalink&access_token=YOUR_TOKEN&limit=1"
```

If all three work, you're set up correctly! ✅

