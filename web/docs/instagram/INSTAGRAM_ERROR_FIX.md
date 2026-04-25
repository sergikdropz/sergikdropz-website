# 🔧 Fix: "Invalid platform app" Error

## Error Message
```
Invalid Request: Request parameters are invalid: Invalid platform app
```

## What This Means

This error occurs when:
1. The Instagram Basic Display product is not added to your Facebook App
2. The app is not properly configured for Instagram
3. The OAuth redirect URI is not added to the app settings

## ✅ Solution Steps

### Step 1: Add Instagram Basic Display Product

1. Go to: https://developers.facebook.com/apps/1186575606889765
2. In the left sidebar, look for **"Add Product"** or check existing products
3. Find **"Instagram Basic Display"** in the product list
4. Click **"Set Up"** or **"Add"** if not already added

### Step 2: Configure Instagram Basic Display

1. After adding the product, click on **"Instagram Basic Display"** in the left sidebar
2. Click on **"Basic Display"** submenu
3. You should see:
   - **Valid OAuth Redirect URIs** section
   - **Deauthorize Callback URL** (optional)
   - **Data Deletion Request URL** (optional)

### Step 3: Add OAuth Redirect URI

1. In the **"Valid OAuth Redirect URIs"** section:
   - Click **"Add URI"** or the **"+"** button
   - Add: `http://localhost:3000/api/instagram/callback`
   - For production, also add: `https://yourdomain.com/api/instagram/callback`
   - Click **"Save Changes"**

### Step 4: Check App Mode

1. Go to **Settings** → **Basic** in your Facebook App
2. Check **"App Mode"**:
   - **Development Mode**: Only works for test users
   - **Live Mode**: Works for all users (requires app review)

3. For testing:
   - Keep it in **Development Mode**
   - Add yourself as a test user:
     - Go to **Roles** → **Test Users**
     - Or use your own Instagram account if you're the app admin

### Step 5: Verify App Configuration

Make sure these are set:

1. **App ID**: `1186575606889765` ✅
2. **App Secret**: `c58e867a7ac7b380491aded06d536fad` ✅
3. **Instagram Basic Display**: Added ✅
4. **OAuth Redirect URI**: `http://localhost:3000/api/instagram/callback` ✅

## 🔍 Alternative: Check App Status

If the error persists:

1. **Check App Review Status:**
   - Go to **App Review** → **Permissions and Features**
   - Make sure `instagram_basic` permission is available

2. **Check Instagram Account Connection:**
   - The Instagram account must be connected to your Facebook account
   - Go to Instagram Settings → Linked Accounts → Facebook

3. **Try Manual Token Generation:**
   - If OAuth still fails, you can generate a token manually:
   - Go to **Tools** → **Graph API Explorer**
   - Select your app
   - Get token with `instagram_basic` permission

## 📝 Quick Checklist

- [ ] Instagram Basic Display product added to app
- [ ] OAuth Redirect URI added: `http://localhost:3000/api/instagram/callback`
- [ ] App is in Development Mode (or Live with proper permissions)
- [ ] Instagram account linked to Facebook account
- [ ] Test user added (if in Development Mode)

## 🚀 After Fixing

Once configured:

1. Restart your dev server:
   ```bash
   cd web
   npm run dev
   ```

2. Visit: `http://localhost:3000/instagram-helper`

3. Click **"🔗 Connect Instagram Account"**

4. Should work now! ✅

---

**Most common issue:** Instagram Basic Display product not added to the app. Make sure it's added in the Facebook Developer Console!

