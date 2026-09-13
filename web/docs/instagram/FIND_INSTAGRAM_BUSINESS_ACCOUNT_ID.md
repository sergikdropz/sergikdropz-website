# How to Find Your Instagram Business Account ID

Your Instagram username is `sergikdropz`, but we need the **numeric Instagram Business Account ID** (not the username).

## Quick Methods to Find Your ID:

### Method 1: Facebook Page Settings (Easiest)
1. Go to your **Facebook Page** (the one connected to your Instagram account)
2. Click **Settings** (left sidebar)
3. Click **Instagram** in the settings menu
4. Your **Instagram Business Account ID** (numeric) will be displayed there
5. It looks like: `17841405309211844` (a long number)

### Method 2: Graph API Explorer
1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app: **1186575606889765**
3. Add your access token
4. Make this API call:
   ```
   GET /me/accounts
   ```
5. For each page returned, make this call:
   ```
   GET /{page-id}?fields=instagram_business_account{id,username}
   ```
6. The `id` field in `instagram_business_account` is your Instagram Business Account ID

### Method 3: Check Your Instagram Account Settings
1. Go to Instagram.com and log in
2. Go to your profile
3. Click **Edit Profile**
4. The URL will show your numeric ID in some cases, or check:
   - Settings → Account → Linked Accounts → Facebook
   - The connected Facebook Page should show the Instagram Business Account ID

### Method 4: Use Instagram Graph API Directly
If you have the right permissions, you can try:
```bash
# This might work if your token has the right permissions
curl "https://graph.facebook.com/v18.0/me/accounts?access_token=YOUR_TOKEN"
# Then for each page:
curl "https://graph.facebook.com/v18.0/{page-id}?fields=instagram_business_account{id,username}&access_token=YOUR_TOKEN"
```

## After You Find the ID:

Add it to `web/.env.local`:
```
INSTAGRAM_USER_ID=17841405309211844
```
(Replace with your actual numeric ID)

Then restart your Next.js dev server.

---

**Note:** The ID is a numeric string (like `17841405309211844`), not your username (`sergikdropz`).

