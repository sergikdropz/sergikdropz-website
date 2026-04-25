# Fix Supabase Files Not Loading in Production

## Problem
Files are not being fetched from Supabase in production deployment. This is because **environment variables are not set in Vercel**.

## Quick Fix

### Step 1: Add Environment Variables to Vercel

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings
   - Click on **"Environment Variables"** in the left sidebar

2. **Add these 3 variables:**
   
   From your local `.env.local` file, copy these values:
   
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[REDACTED - get from Supabase Dashboard -> Settings -> API]
   SUPABASE_SERVICE_ROLE_KEY=[REDACTED - use a secure secret manager]
   ```

3. **Set Environment:**
   - For each variable, select **"Production"** environment
   - Optionally also select "Preview" and "Development" if you want

4. **Save and Redeploy:**
   - Click "Save" for each variable
   - Go to "Deployments" tab
   - Click "Redeploy" on the latest deployment
   - Or push a new commit to trigger automatic deployment

### Step 2: Verify Files Are in Supabase

1. **Check Supabase Storage:**
   - Go to: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/storage/buckets
   - Verify `audio-files` bucket exists and has files
   - Verify bucket is **Public**

2. **Check Database:**
   - Go to: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/editor
   - Check `audio_files` table has records

### Step 3: Test the Fix

1. **Check Diagnostic Endpoint:**
   - Visit: https://sergikdropz.com/api/supabase-check
   - Should show all ✅ green checkmarks

2. **Test Audio Playback:**
   - Go to: https://sergikdropz.com/music-library
   - Try playing a track
   - Check browser Network tab - requests should go to `*.supabase.co`

## Why This Happened

- Environment variables in `.env.local` are **only for local development**
- Vercel production needs environment variables set in the **Vercel Dashboard**
- The code checks for `NEXT_PUBLIC_SUPABASE_URL` - if missing, it can't connect to Supabase

## Verification Checklist

- [ ] Added `NEXT_PUBLIC_SUPABASE_URL` to Vercel
- [ ] Added `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel  
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` to Vercel
- [ ] All variables set for "Production" environment
- [ ] Redeployed the site
- [ ] `/api/supabase-check` shows all ✅
- [ ] Audio files play in production
- [ ] Images load from Supabase (if using Supabase for images)

## If Files Are Missing from Supabase

If the diagnostic shows files are missing:

1. **Upload files to Supabase:**
   ```bash
   cd web
   node scripts/upload-audio-to-supabase.mjs
   ```

2. **Check upload script output** for any errors

3. **Verify in Supabase Dashboard** that files appear in Storage

## Need Help?

- Check Vercel logs: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/logs
- Check Supabase logs: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/logs
- Run diagnostic: https://sergikdropz.com/api/supabase-check
