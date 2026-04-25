# How to Get Your Instagram Business Account ID

Your `INSTAGRAM_ACCESS_TOKEN` has been saved to `.env.local`, but you need to add your `INSTAGRAM_USER_ID` (Instagram Business Account ID).

## Method 1: Via Facebook Page (Easiest)

1. Go to your **Facebook Page** (the one connected to your Instagram account)
2. Click **Settings** (left sidebar)
3. Click **Instagram** in the settings menu
4. Your **Instagram Business Account ID** will be displayed there
5. Copy it and add to `.env.local`:
   ```
   INSTAGRAM_USER_ID=YOUR_ACCOUNT_ID_HERE
   ```

## Method 2: Via Graph API Explorer

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

## Method 3: Via API Call (if you have page access)

If your token has `pages_read_engagement` permission, you can run:

```bash
cd web
node -e "
const token = 'YOUR_ACCESS_TOKEN';
fetch('https://graph.facebook.com/v18.0/me/accounts?access_token=' + token)
  .then(r => r.json())
  .then(data => {
    if (data.data && data.data.length > 0) {
      return fetch('https://graph.facebook.com/v18.0/' + data.data[0].id + '?fields=instagram_business_account{id,username}&access_token=' + token);
    }
  })
  .then(r => r.json())
  .then(data => {
    if (data.instagram_business_account) {
      console.log('Instagram Business Account ID:', data.instagram_business_account.id);
    }
  });
"
```

## After Adding the ID

1. Add `INSTAGRAM_USER_ID=YOUR_ID` to `web/.env.local`
2. Restart your Next.js dev server
3. Test with: `node scripts/test-instagram-api.mjs`

---

**Note:** Your access token is already saved. You just need to add the Instagram Business Account ID.

