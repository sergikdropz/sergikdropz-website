# 🔄 Instagram API with Instagram Login - Update

## 📅 Important: Scope Deprecation

**Old scope values are deprecated and will stop working on January 27, 2025.**

### Old Scopes (Deprecated)
- ❌ `business_basic`
- ❌ `business_content_publish`
- ❌ `business_manage_messages`
- ❌ `business_manage_comments`

### New Scopes (Current)
- ✅ `instagram_business_basic` (replaces `business_basic`)
- ✅ `instagram_business_content_publish` (replaces `business_content_publish`)
- ✅ `instagram_business_manage_messages` (replaces `business_manage_messages`)
- ✅ `instagram_business_manage_comments` (replaces `business_manage_comments`)

## 🔀 Two Authentication Methods

### 1. Instagram API with Instagram Login (Recommended)
- ✅ **No Facebook Page required**
- ✅ Simpler setup
- ✅ Uses new scope values: `instagram_business_basic`, `instagram_business_content_publish`
- ✅ Still uses Facebook OAuth endpoint (for consistency)
- ✅ Direct access to Instagram Business Account

**Scopes:**
```
instagram_business_basic,instagram_business_content_publish
```

### 2. Instagram API with Facebook Login (Current)
- ⚠️ **Requires Facebook Page connection**
- ✅ More features (ads, tagging)
- ✅ Uses scopes: `instagram_graph_user_profile`, `instagram_graph_user_media`, `pages_read_engagement`
- ✅ Requires fetching Instagram Business Account ID through Facebook Pages

**Scopes:**
```
instagram_graph_user_profile,instagram_graph_user_media,pages_read_engagement
```

## 🚀 What Changed

### Updated Files

1. **`web/app/instagram-helper/page.tsx`**
   - Added radio buttons to choose authentication method
   - Updated scopes to use new values for Instagram Login
   - Updated instructions to reflect both options
   - Added deprecation notice

2. **OAuth Flow**
   - Both methods use the same Facebook OAuth endpoint
   - Different scopes determine which API access you get
   - Instagram Login doesn't require Facebook Page lookup

## 📋 How to Use

1. **Visit:** `http://localhost:3001/instagram-helper`
2. **Choose:** "Instagram Login" (recommended) or "Facebook Login"
3. **Click:** "🔗 Connect Instagram Account"
4. **Authorize:** Grant permissions
5. **Done:** Credentials saved automatically

## ⚠️ Migration Notes

- If you're currently using Facebook Login, you can continue using it
- If you want to switch to Instagram Login, just re-authorize with the new method
- Old tokens with deprecated scopes will stop working on January 27, 2025
- Update your code before the deadline to avoid disruption

## 🔗 References

- [Instagram API with Instagram Login Documentation](https://developers.facebook.com/docs/instagram-api/instagram-api-with-instagram-login)
- [Instagram Graph API Migration Guide](./INSTAGRAM_GRAPH_API_MIGRATION.md)

