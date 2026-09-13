# 📸 Instagram Setup - Step-by-Step Guide

## Direct Links & Exact Steps

### Step 1: Open Your Facebook App

**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765/dashboard/
```

### Step 2: Add Instagram Basic Display Product

1. **Look for "Add Product" button** (usually at the bottom of the left sidebar, or in the main dashboard)
2. **OR go directly to Products page:**
   ```
   https://developers.facebook.com/apps/1186575606889765/dashboard/products/
   ```
3. **Find "Instagram Basic Display"** in the product list
4. **Click "Set Up"** button next to it

### Step 3: Configure Instagram Basic Display

**Direct Link (after product is added):**
```
https://developers.facebook.com/apps/1186575606889765/instagram-basic-display/basic-display/
```

1. **Scroll down to "Valid OAuth Redirect URIs"** section
2. **Click "Add URI"** or the **"+"** button
3. **Enter this exact URL:**
   ```
   http://localhost:3000/api/instagram/callback
   ```
4. **Click "Save Changes"** button at the bottom

### Step 4: Add Production URL (Optional but Recommended)

In the same "Valid OAuth Redirect URIs" section, also add:
```
https://yourdomain.com/api/instagram/callback
```
(Replace `yourdomain.com` with your actual production domain)

### Step 5: Check App Mode

**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765/settings/basic/
```

1. **Scroll to "App Mode"** section
2. **For testing:** Keep it in **"Development Mode"**
3. **For production:** Switch to **"Live Mode"** (requires app review)

### Step 6: Add Test User (If in Development Mode)

**Direct Link:**
```
https://developers.facebook.com/apps/1186575606889765/roles/roles/
```

1. **Click "Add People"** or **"Roles"** tab
2. **Add yourself as a test user** or use your own Instagram account if you're the app admin

## ✅ Verification Checklist

After completing the steps above, verify:

- [ ] Instagram Basic Display product is added (should show in left sidebar)
- [ ] OAuth Redirect URI is added: `http://localhost:3000/api/instagram/callback`
- [ ] "Save Changes" button was clicked
- [ ] App is in Development Mode (or Live with proper permissions)

## 🚀 Test the Connection

1. **Start your dev server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Visit:**
   ```
   http://localhost:3000/instagram-helper
   ```

3. **Click "🔗 Connect Instagram Account"**

4. **Should work now!** ✅

## 🐛 If Still Getting Errors

### Error: "Invalid platform app"
- Make sure Instagram Basic Display product is **actually added** (check left sidebar)
- Verify the OAuth Redirect URI is **exactly** `http://localhost:3000/api/instagram/callback`
- Make sure you clicked **"Save Changes"**

### Error: "Redirect URI mismatch"
- The redirect URI in your app settings must **exactly match** what's in the code
- Check for typos, extra spaces, or missing `http://`

### Error: "App not approved"
- In Development Mode, only test users can authorize
- Add yourself as a test user in Roles → Test Users
- Or switch to Live Mode (requires app review)

---

**Quick Reference:**
- App Dashboard: https://developers.facebook.com/apps/1186575606889765/dashboard/
- Instagram Basic Display: https://developers.facebook.com/apps/1186575606889765/instagram-basic-display/basic-display/
- App Settings: https://developers.facebook.com/apps/1186575606889765/settings/basic/

