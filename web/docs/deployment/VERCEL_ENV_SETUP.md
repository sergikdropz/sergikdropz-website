# 🚨 URGENT: Add Supabase Environment Variables to Vercel

## The Problem
Your files are in Supabase, but they're not loading in production because Vercel doesn't have the Supabase environment variables.

## Quick Fix (2 minutes)

### Step 1: Open Vercel Settings
Click this link: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings/environment-variables

### Step 2: Add These 3 Variables

**Variable 1:**
- **Key:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** `https://<your-project-ref>.supabase.co`
- **Environment:** ✅ Production (check this box)
- Click **"Save"**

**Variable 2:**
- **Key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** `[REDACTED - get from Supabase Dashboard -> Settings -> API]`
- **Environment:** ✅ Production (check this box)
- Click **"Save"**

**Variable 3:**
- **Key:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** `[REDACTED - store in Vercel Secret Manager]`
- **Environment:** ✅ Production (check this box)
- Click **"Save"**

### Step 3: Redeploy
1. Go to: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/deployments
2. Find the latest deployment
3. Click the **"⋯"** menu (three dots)
4. Click **"Redeploy"**
5. Wait for deployment to complete (~1-2 minutes)

### Step 4: Verify It Works
1. Visit: https://sergikdropz.com/api/supabase-check
2. Should see all ✅ green checkmarks
3. Try playing audio on: https://sergikdropz.com/music-library

## That's It! 🎉

After adding these 3 environment variables and redeploying, all files will load from Supabase in production.

## Why This Happened
- Environment variables in `.env.local` only work locally
- Vercel production needs environment variables set in the Vercel dashboard
- The code checks for `NEXT_PUBLIC_SUPABASE_URL` - if missing, it can't connect to Supabase

## Verification
Your files are already in Supabase:
- ✅ 379 audio files in database
- ✅ Files in Supabase Storage
- ✅ Everything is ready - just needs the env vars!
