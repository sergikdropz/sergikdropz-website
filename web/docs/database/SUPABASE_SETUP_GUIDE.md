# Supabase Setup Guide - Cheapest Cloud Storage & Database

This guide will help you set up Supabase for storing audio files and managing purchases - **starting at $0/month** with the free tier!

## Why Supabase?

✅ **Free Tier Includes:**
- 500MB PostgreSQL database (perfect for purchases)
- 1GB file storage (covers initial audio files)
- 2GB bandwidth/month
- Unlimited API requests

✅ **Cost After Free Tier:**
- Storage: $0.021/GB/month (~$0.02/GB)
- For 10GB audio files: ~$0.19/month
- Database: $0.125/GB/month after 500MB

**Total: ~$0-2/month** (vs $20-60/month for other services)

---

## Step 1: Create Supabase Account

1. **Sign up for Supabase:**
   - Go to https://supabase.com
   - Click "Start your project"
   - Sign up with GitHub (easiest) or email

2. **Create a new project:**
   - Click "New Project"
   - Choose organization (or create one)
   - Project name: `sergik-website`
   - Database password: **Save this password!** (you'll need it)
   - Region: Choose closest to you
   - Click "Create new project"
   - Wait 2-3 minutes for setup

---

## Step 2: Get Your API Keys

1. **Go to Project Settings:**
   - Click the gear icon (⚙️) in left sidebar
   - Click "API" in the settings menu

2. **Copy your keys:**
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...` (starts with `eyJ`)
   - **service_role key**: `eyJhbGc...` (keep this secret!)

3. **Add to environment variables:**
   
   Create or update `web/.env.local`:
   
   ```bash
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   
   # Existing Stripe keys (keep these)
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## Step 3: Set Up Database Schema

1. **Go to SQL Editor in Supabase:**
   - Click "SQL Editor" in left sidebar
   - Click "New query"

2. **Run the schema SQL:**
   - Copy the contents of `web/supabase/schema.sql`
   - Paste into SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)

This creates:
- `purchases` table (for Stripe purchases)
- `audio_files` table (for your audio library)
- Proper indexes for performance

---

## Step 4: Set Up Storage Bucket

1. **Go to Storage in Supabase:**
   - Click "Storage" in left sidebar
   - Click "Create a new bucket"

2. **Create `audio-files` bucket:**
   - Name: `audio-files`
   - Public bucket: **Yes** (for public previews)
   - Click "Create bucket"

3. **Set up bucket policies:**
   - Go to "Policies" tab
   - Click "New Policy"
   - Use the policies from `web/supabase/storage-policies.sql`
   - Or use "Public" access for now (simpler, less secure)

---

## Step 5: Install Dependencies

Run in the `web` directory:

```bash
cd web
npm install @supabase/supabase-js
```

---

## Step 6: Upload Your Audio Files

Use the migration script to upload existing files:

```bash
cd web
node scripts/upload-audio-to-supabase.mjs
```

This will:
- Scan your `public/audio/` directory
- Upload each file to Supabase Storage
- Store file URLs in the database
- Preserve folder structure

**Note:** This may take a while for 290 files. The script shows progress.

---

## Step 7: Update Your Code

The integration is already set up! The following files have been updated:

- ✅ `web/lib/supabase.ts` - Supabase client
- ✅ `web/app/api/stripe/webhook/route.ts` - Now saves purchases to database
- ✅ `web/app/api/audio/upload/route.ts` - Upload new audio files
- ✅ `web/app/api/audio/list/route.ts` - List audio files from database

---

## Step 8: Test the Integration

1. **Test database connection:**
   ```bash
   npm run dev
   ```
   Visit: http://localhost:3000/api/health
   Should show Supabase connection status

2. **Test file upload:**
   - Use the upload API or admin panel
   - Check Supabase Storage dashboard

3. **Test purchase flow:**
   - Make a test purchase
   - Check `purchases` table in Supabase

---

## Step 9: Deploy to Production

1. **Add environment variables to Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY` (for server-side operations)

2. **Redeploy:**
   ```bash
   vercel --prod
   ```

---

## Monitoring & Costs

### Check Your Usage:

1. **Go to Supabase Dashboard:**
   - Click "Settings" → "Usage"
   - See database size, storage used, bandwidth

2. **Set up alerts:**
   - Go to "Settings" → "Billing"
   - Set up email alerts for usage limits

### Cost Estimates:

**Free Tier (0-1GB storage):**
- $0/month ✅

**Small Scale (1-10GB storage):**
- Storage: ~$0.19/month
- Database: $0 (under 500MB)
- **Total: ~$0.19/month**

**Medium Scale (10-50GB storage):**
- Storage: ~$1.03/month
- Database: $0 (under 500MB)
- **Total: ~$1/month**

---

## Troubleshooting

### "Invalid API key" error
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
- Make sure you copied the full keys (they're long!)
- Restart dev server after adding env vars

### Files not uploading
- Check bucket name matches (`audio-files`)
- Verify bucket is public or policies allow upload
- Check file size limits (Supabase free tier: 50MB per file)

### Database connection fails
- Verify database password is correct
- Check project is not paused (free tier pauses after 1 week inactivity)
- Make sure schema was created successfully

### Storage quota exceeded
- Free tier: 1GB
- Upgrade to Pro ($25/month) for 100GB
- Or use hybrid: Supabase for database, Backblaze B2 for storage

---

## Next Steps

1. ✅ Set up Supabase account
2. ✅ Run database schema
3. ✅ Upload audio files
4. ✅ Test purchase flow
5. ✅ Deploy to production

## Support

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Project Issues: Check GitHub issues

---

**You're all set! Your audio files and purchases are now stored in Supabase for ~$0-2/month! 🎉**

