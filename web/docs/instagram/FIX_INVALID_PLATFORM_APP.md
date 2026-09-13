# 🔧 Fix: "Invalid platform app" Error

## Error Message
```
Invalid Request: Request parameters are invalid: Invalid platform app
```

## What This Means

This error occurs when your Facebook app is **not properly configured** for Instagram Basic Display API.

## ✅ Quick Fix (5 Minutes)

### Step 1: Open Facebook App Dashboard
**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765
```

### Step 2: Add Instagram Graph API Product

⚠️ **IMPORTANT:** Instagram Basic Display API was **deprecated on December 4, 2024**. You must use **Instagram Graph API** instead.

1. **Look for "Add Product"** button (usually in left sidebar or dashboard)
2. **OR go directly to Products:**
   ```
   https://developers.facebook.com/apps/1186575606889765/dashboard/products/
   ```
3. **Find "Instagram Graph API"** in the product list (NOT "Instagram Basic Display")
4. **Click "Set Up"** or **"Add"** button

### Step 3: Configure OAuth Redirect URI

**Direct Link (after product is added):**
```
https://developers.facebook.com/apps/1186575606889765/instagram-graph-api/basic-display/
```

1. **Scroll to "Valid OAuth Redirect URIs"** section
2. **Click "Add URI"** or the **"+"** button
3. **Enter this exact URL:**
   ```
   http://localhost:3000/api/instagram/callback
   ```
4. **For production, also add:**
   ```
   https://yourdomain.com/api/instagram/callback
   ```
   (Replace `yourdomain.com` with your actual domain)
5. **Click "Save Changes"** button at the bottom

### Step 4: Check App Mode

**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765/settings/basic/
```

1. **Scroll to "App Mode"** section
2. **For testing:** Keep it in **"Development Mode"**
3. **For production:** Switch to **"Live Mode"** (requires app review)

### Step 5: Add Test User (If in Development Mode)

**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765/roles/roles/
```

1. **Click "Add People"** or **"Roles"** tab
2. **Add yourself as a test user** or use your own Instagram account if you're the app admin

## ✅ Verification Checklist

After completing the steps above, verify:

- [ ] **Instagram Graph API** product is added (NOT "Instagram Basic Display")
- [ ] OAuth Redirect URI is added: `http://localhost:3000/api/instagram/callback`
- [ ] "Save Changes" button was clicked
- [ ] App is in Development Mode (for testing) or Live Mode (for production)
- [ ] You have an **Instagram Business or Creator account** (not personal)
- [ ] Your Instagram account is **connected to a Facebook Page**

## 🚀 Try Again

After completing the setup:

1. Go back to: `http://localhost:3000/instagram-helper`
2. Click **"🔗 Connect Instagram Account"** button
3. Authorize the app
4. You should be redirected back with success! ✅

## ❓ Still Getting Error?

If you still see the error after completing all steps:

1. **Wait 2-3 minutes** - Facebook sometimes takes time to propagate changes
2. **Clear browser cache** and try again
3. **Check the exact error message** - it might be a different issue
4. **Verify the redirect URI matches exactly** - no trailing slashes, correct protocol (http vs https)

## 📝 Alternative: Manual Posts (No API Needed)

If you can't get the API working, you can still add Instagram posts manually:

1. Visit: `http://localhost:3000/instagram-helper`
2. Paste Instagram post URLs in the form
3. Click "Save"
4. Posts will appear on your homepage immediately! ✅

---

**Quick Links:**
- App Dashboard: https://developers.facebook.com/apps/1186575606889765
- Instagram Graph API: https://developers.facebook.com/apps/1186575606889765/instagram-graph-api/basic-display/
- App Settings: https://developers.facebook.com/apps/1186575606889765/settings/basic/

**⚠️ Note:** If you see "Instagram Basic Display" in your app, it's deprecated. You need to add "Instagram Graph API" instead.

