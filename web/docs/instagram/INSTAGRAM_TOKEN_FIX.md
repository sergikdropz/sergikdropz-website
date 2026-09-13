# 🔧 Instagram Token Fix Guide

## Current Status

✅ **Saved to `.env.local`:**
- App ID: `1186575606889765`
- App Secret: `c58e867a7ac7b380491aded06d536fad`
- Access Token: (Facebook token - needs to be Instagram token)

⚠️ **Still Needed:**
- Instagram User ID
- Instagram-specific Access Token (not Facebook token)

## The Issue

The token you provided is a **Facebook Graph API token**, but we need an **Instagram Basic Display API token**. These are different!

## Solution: Get Instagram Token

### Step 1: Generate Instagram Token

1. **Go to Graph API Explorer:**
   - https://developers.facebook.com/tools/explorer/

2. **Select your app:**
   - In the top right, select app ID: `1186575606889765`

3. **Generate Token:**
   - Click "Generate Access Token"
   - **IMPORTANT:** Select these permissions:
     - ✅ `instagram_basic`
     - ✅ `pages_read_engagement`
   - Click "Generate Access Token"

4. **Copy the NEW token** (it should work with `graph.instagram.com`)

### Step 2: Get Your Instagram User ID

Once you have the Instagram token, the script will auto-fetch your User ID. Or you can:

1. **In Graph API Explorer:**
   - Use your Instagram token
   - Make GET request to: `me?fields=id,username`
   - Copy the `id` value

2. **Or use this script:**
   ```bash
   cd web
   node scripts/finalize-instagram-setup.mjs
   ```
   (After updating the token in the script)

## Quick Fix Script

I can create a script that accepts the Instagram token and User ID. Just provide:
1. The Instagram token (with `instagram_basic` permission)
2. Your Instagram User ID (if you have it)

## Alternative: Manual Setup

If you prefer, you can manually edit `web/.env.local`:

```bash
INSTAGRAM_APP_ID=1186575606889765
INSTAGRAM_APP_SECRET=c58e867a7ac7b380491aded06d536fad
INSTAGRAM_ACCESS_TOKEN=your_instagram_token_here
INSTAGRAM_USER_ID=your_instagram_user_id_here
```

## Testing

Once you have the correct token and User ID:

```bash
cd web
node scripts/test-instagram-api.mjs
```

This will verify everything is working!

---

**The key difference:** Facebook tokens work with `graph.facebook.com`, but Instagram Basic Display tokens work with `graph.instagram.com`.

