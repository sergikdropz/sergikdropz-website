# 📸 Add Instagram Posts - Quick Guide

## ✅ Three Easy Ways to Add Your Posts

### Method 1: Web Interface (Easiest!) ⚡

1. **Start your dev server:**
   ```bash
   cd web
   npm run dev
   ```

2. **Visit the helper page:**
   ```
   http://localhost:3000/instagram-helper
   ```

3. **Add your post URLs:**
   - Get URLs from Instagram (see instructions below)
   - Paste them into the form
   - Click "Save Posts"

**Done!** Your posts will appear on the homepage.

---

### Method 2: Command Line Script

1. **Run the helper script:**
   ```bash
   cd web
   node scripts/add-instagram-posts.mjs
   ```

2. **Follow the prompts:**
   - Paste your Instagram post URLs one at a time
   - Type "done" when finished

**Done!** Your posts are saved.

---

### Method 3: Manual Edit

1. **Open the file:**
   ```
   web/data/instagram-posts.json
   ```

2. **Replace the example URLs:**
   ```json
   {
     "username": "sergikdropz",
     "posts": [
       "https://www.instagram.com/p/YOUR_POST_ID_1/",
       "https://www.instagram.com/p/YOUR_POST_ID_2/",
       "https://www.instagram.com/p/YOUR_POST_ID_3/"
     ]
   }
   ```

3. **Save the file**

**Done!** Posts will appear automatically.

---

## 📋 How to Get Instagram Post URLs

### On Mobile (Instagram App):

1. Open the Instagram app
2. Navigate to a post you want to display
3. Tap the **three dots (⋯)** in the top right corner
4. Tap **"Copy link"**
5. The URL is now in your clipboard - paste it!

### On Desktop (Instagram Web):

1. Go to instagram.com and log in
2. Click on a post to open it
3. Look at the URL in your browser - it's already there!
   - Format: `https://www.instagram.com/p/ABC123xyz/`
4. Copy the entire URL

### Quick Tip:
- You can also right-click on a post → "Copy link address" (desktop)
- Or share the post → "Copy link" (mobile)

---

## ✅ What Happens Next?

Once you add your post URLs:

1. **Posts appear on homepage** - In the "Recent Posts" section
2. **Responsive grid** - 1 column mobile, 2 tablet, 3 desktop
3. **Official embeds** - Uses Instagram's embed API
4. **Automatic updates** - If you set up Instagram API (optional)

---

## 🎯 Recommended: Start with 6 Posts

- Add 6 recent posts for best display
- Most recent posts appear first
- You can add more later (up to 12)

---

## 🐛 Troubleshooting

**Posts not showing?**
- Make sure URLs don't contain "EXAMPLE_POST"
- Check that URLs include `instagram.com/p/`
- Verify the file saved correctly

**Need help?**
- See: `web/docs/instagram/INSTAGRAM_QUICK_START.md`
- Or: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`

---

**That's it! Your Instagram posts will now display beautifully on your homepage! 🎉**

