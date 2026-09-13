# 🚀 Start Here - Supabase Setup

## Quick Setup (Choose One Method)

### Method 1: Interactive Setup Script (Easiest)
```bash
cd web
node scripts/setup-supabase.mjs
```
This will guide you through entering your Supabase credentials.

### Method 2: Manual Setup
1. **Get your Supabase keys:**
   - Go to https://supabase.com/dashboard
   - Select your project (or create one)
   - Settings → API
   - Copy: Project URL, anon key, service_role key

2. **Add to `.env.local`:**
   ```bash
   # Open web/.env.local and add:
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

3. **Test connection:**
   ```bash
   node scripts/test-supabase-connection.mjs
   ```

## Next Steps After Configuration

### 1. Set Up Database (Required)
1. Go to Supabase Dashboard → SQL Editor
2. Open `web/supabase/schema.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click "Run" (or Cmd/Ctrl + Enter)

### 2. Create Storage Bucket (Required)
1. Go to Supabase Dashboard → Storage
2. Click "Create a new bucket"
3. Name: `audio-files`
4. Public bucket: **Yes** ✅
5. Click "Create bucket"

### 3. Upload Your Audio Files
```bash
cd web
node scripts/upload-audio-to-supabase.mjs
```

This will:
- Scan `web/public/audio/` directory
- Upload all audio files to Supabase Storage
- Store metadata in database
- Show progress

### 4. Verify Everything Works
```bash
# Test connection
node scripts/test-supabase-connection.mjs

# Start dev server
npm run dev

# Visit health endpoint
# http://localhost:3000/api/health
```

## Need Help?

- **Full Guide:** `SUPABASE_SETUP_GUIDE.md`
- **Quick Start:** `SUPABASE_QUICKSTART.md`
- **Checklist:** `SUPABASE_SETUP_CHECKLIST.md`

## What You Need

1. ✅ Supabase account (free at https://supabase.com)
2. ✅ API keys from Supabase Dashboard
3. ✅ 5-10 minutes to complete setup

---

**Ready? Run:** `node scripts/setup-supabase.mjs`

