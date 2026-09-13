# 📸 Instagram Setup - Manual Step-by-Step Guide

## ⚠️ If You Can't Find "Instagram Basic Display"

Instagram Basic Display may have been moved or renamed. Here's how to find it:

### Method 1: Search for Products

1. **Go to your app dashboard:**
   ```
   https://developers.facebook.com/apps/1186575606889765/dashboard/
   ```

2. **Look for "Products" in the left sidebar** (may be at the bottom)

3. **Click "Products"** or look for a **"+"** or **"Add Product"** button

4. **In the products list, look for:**
   - "Instagram Basic Display"
   - "Instagram" (may be listed as just "Instagram")
   - "Instagram Graph API" (different, but may work)

### Method 2: Direct Navigation

1. **Try this direct link:**
   ```
   https://developers.facebook.com/apps/1186575606889765/instagram-basic-display/
   ```

2. **If that doesn't work, try:**
   ```
   https://developers.facebook.com/apps/1186575606889765/settings/advanced/
   ```

### Method 3: Check App Type

1. **Go to Settings → Basic:**
   ```
   https://developers.facebook.com/apps/1186575606889765/settings/basic/
   ```

2. **Check "App Type"** - it should be set to **"Consumer"** or **"Business"**

3. **If it's set to something else, you may need to change it**

## 🔄 Alternative: Use Manual Posts (No API Needed!)

If you can't find Instagram Basic Display, you can still use Instagram posts **without the API**:

### Step 1: Get Post URLs

1. Open Instagram (web or app)
2. Go to a post you want to display
3. Click the **three dots (⋯)** menu
4. Select **"Copy link"**
5. You'll get a URL like: `https://www.instagram.com/p/ABC123xyzDEF/`

### Step 2: Add to Your Site

1. **Visit your helper page:**
   ```
   http://localhost:3000/instagram-helper
   ```

2. **Paste the post URLs** in the input fields

3. **Click "Save"**

4. **Posts will appear on your homepage immediately!** ✅

### Step 3: Update Posts Manually

- Add new posts anytime via `/instagram-helper`
- No API setup needed
- Works immediately

## 🔍 Still Can't Find It?

### Check These:

1. **App Status:**
   - Is your app in Development Mode?
   - Some products only show in certain app modes

2. **Permissions:**
   - Go to **App Review → Permissions and Features**
   - Look for `instagram_basic` permission

3. **App Category:**
   - Settings → Basic → Category
   - Some categories may not show Instagram products

4. **Try Instagram Graph API Instead:**
   - Look for "Instagram Graph API" product
   - This is different but may work for your use case

## 📝 What to Look For

In the Facebook Developer Console, you should see:

- **Left Sidebar:** Products section (may be collapsed)
- **Main Area:** List of available products
- **Look for:** Any product with "Instagram" in the name

## 🚀 Quick Solution: Use Manual Posts

**The easiest solution right now is to use manual posts:**

1. Visit: `http://localhost:3000/instagram-helper`
2. Add your Instagram post URLs
3. Save
4. Done! ✅

**No API setup needed!** This works immediately and you can always add API later.

---

**Need more help?** Share a screenshot of your Facebook Developer Console dashboard and I can guide you more specifically!

