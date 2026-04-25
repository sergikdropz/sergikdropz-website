# Supabase Setup Checklist ✅

Use this checklist to verify your Supabase integration is complete.

## Pre-Setup Verification

- [ ] Supabase package installed (`npm list @supabase/supabase-js`)
- [ ] All files created (check `lib/supabase.ts`, `supabase/schema.sql`)
- [ ] No TypeScript errors (`npm run build`)

## Step 1: Create Supabase Account

- [ ] Signed up at https://supabase.com
- [ ] Created new project
- [ ] Saved database password securely
- [ ] Project is active (not paused)

## Step 2: Get API Keys

- [ ] Opened Project Settings → API
- [ ] Copied Project URL
- [ ] Copied anon/public key
- [ ] Copied service_role key (keep secret!)

## Step 3: Environment Variables

- [ ] Created `web/.env.local` file
- [ ] Added `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Added `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Verified no typos in keys

## Step 4: Database Setup

- [ ] Opened Supabase SQL Editor
- [ ] Copied `supabase/schema.sql` content
- [ ] Ran SQL script
- [ ] Verified no errors
- [ ] Checked Tables: `purchases` and `audio_files` exist

## Step 5: Storage Setup

- [ ] Opened Storage in Supabase Dashboard
- [ ] Created bucket named `audio-files`
- [ ] Set bucket to Public
- [ ] (Optional) Applied storage policies from `supabase/storage-policies.sql`

## Step 6: Test Connection

- [ ] Started dev server: `npm run dev`
- [ ] Visited: http://localhost:3000/api/health
- [ ] Verified Supabase status shows "ok"
- [ ] No connection errors in console

## Step 7: Upload Audio Files

- [ ] Verified audio files exist in `web/public/audio/`
- [ ] Ran: `node scripts/upload-audio-to-supabase.mjs`
- [ ] Script completed without errors
- [ ] Checked Supabase Storage → `audio-files` bucket
- [ ] Verified files appear in Storage
- [ ] Checked Database → `audio_files` table
- [ ] Verified metadata records exist

## Step 8: Test Purchase Flow

- [ ] Made test Stripe purchase
- [ ] Checked Database → `purchases` table
- [ ] Verified purchase record exists
- [ ] Tested download verification API

## Step 9: Production Deployment

- [ ] Added Supabase env vars to Vercel
- [ ] Verified all 3 Supabase keys in Vercel
- [ ] Deployed to production
- [ ] Tested health endpoint in production
- [ ] Verified Supabase connection works

## Troubleshooting

### Connection fails
- [ ] Checked API keys are correct
- [ ] Verified project is not paused
- [ ] Checked network/firewall settings

### Upload fails
- [ ] Verified bucket name is `audio-files`
- [ ] Checked bucket is public
- [ ] Verified file size < 50MB (free tier limit)

### Database errors
- [ ] Verified schema.sql ran successfully
- [ ] Checked table names match exactly
- [ ] Verified RLS policies are correct

## Success Criteria

✅ Health endpoint shows Supabase: "ok"  
✅ Files upload to Storage successfully  
✅ Purchases save to database  
✅ No errors in console/logs  

---

**Once all items are checked, your Supabase integration is complete! 🎉**

