# Instagram API Setup Status

## ✅ What's Done
- ✅ `INSTAGRAM_ACCESS_TOKEN` saved to `.env.local`
- ✅ `INSTAGRAM_USER_ID` set to `sergikdropz` (username - needs to be numeric ID)

## ⚠️ What's Needed

### 1. Get Your Numeric Instagram Business Account ID

Your username `sergikdropz` is **not** the ID we need. We need a **numeric ID** like `17841405309211844`.

**Easiest Way:**
1. Go to your **Facebook Page** (connected to Instagram)
2. **Settings** → **Instagram**
3. Copy the **Instagram Business Account ID** (numeric)
4. Update `web/.env.local`:
   ```
   INSTAGRAM_USER_ID=17841405309211844
   ```
   (Replace with your actual numeric ID)

### 2. Token Permissions

Your token might need the `pages_read_engagement` permission. If API calls fail, you may need to:
1. Re-authorize the app with the correct permissions
2. Or use the OAuth flow on `/instagram-helper` page which requests the right permissions

## 🔍 How to Find Your Instagram Business Account ID

### Option A: Facebook Page (Recommended)
1. Facebook.com → Your Page
2. Settings → Instagram
3. Copy the numeric ID shown

### Option B: Graph API Explorer
1. https://developers.facebook.com/tools/explorer/
2. Select app: `1186575606889765`
3. Add your token
4. Call: `GET /me/accounts`
5. For each page: `GET /{page-id}?fields=instagram_business_account{id,username}`
6. The `id` is your Instagram Business Account ID

### Option C: Instagram Account Settings
- Instagram.com → Profile → Edit Profile
- Check URL or Settings → Linked Accounts → Facebook
- The connected page should show the ID

## 🧪 Test After Adding ID

```bash
cd web
node scripts/test-instagram-api.mjs
```

## 📝 Current .env.local Status

```
INSTAGRAM_ACCESS_TOKEN=EAAQ3LymMPSUBQZAviwG... ✅
INSTAGRAM_USER_ID=sergikdropz ⚠️ (needs to be numeric ID)
```

---

**Next Step:** Get your numeric Instagram Business Account ID and update `INSTAGRAM_USER_ID` in `.env.local`

