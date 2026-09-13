# Instagram Posts - Quick Start

## ✅ Two Ways to Add Instagram Posts

### Method 1: Manual URLs (2 minutes) ⚡ RECOMMENDED

**Easiest way - no API setup required!**

1. **Open:** `web/data/instagram-posts.json`

2. **Get your post URLs:**
   - Go to Instagram (web or app)
   - Open a post you want to show
   - Click the three dots (⋯) menu
   - Click "Copy link"
   - Paste it into the `posts` array

3. **Example:**
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

4. **Save the file** - posts will appear automatically!

**Done!** Your Instagram posts will now display on the homepage.

---

### Method 2: Instagram API (10 minutes)

**For automatic updates - requires Facebook Developer account**

1. **Set up Instagram API:**
   - Follow: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`
   - Get App ID, App Secret, Access Token, User ID

2. **Add to `web/.env.local`:**
```bash
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_USER_ID=your_user_id
```

3. **Restart your dev server:**
```bash
cd web
npm run dev
```

**Done!** Posts will automatically fetch from Instagram API.

---

## 🎯 Which Method Should I Use?

- **Use Method 1** if you want to:
  - Get started quickly
  - Manually control which posts appear
  - Avoid API setup complexity

- **Use Method 2** if you want to:
  - Automatically show your latest posts
  - Have posts update without manual changes
  - Build a more dynamic feed

---

## 📝 Notes

- You can add 6-12 post URLs (the grid shows up to 6)
- Posts are displayed in the order you add them
- The system automatically filters out example URLs
- If API fails, it falls back to manual URLs
- Posts use Instagram's official embed API for best compatibility

---

## 🐛 Troubleshooting

**Posts not showing?**
1. Check `web/data/instagram-posts.json` - make sure URLs don't contain "EXAMPLE_POST"
2. Check browser console for errors
3. Visit: `http://localhost:3000/api/instagram/posts?username=sergikdropz` to test

**Need help?**
- See full guide: `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`
- Check environment variables: `web/docs/environment/ENV_VARIABLES.md`

