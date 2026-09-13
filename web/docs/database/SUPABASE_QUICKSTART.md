# Supabase Quick Start

## 🚀 5-Minute Setup

### 1. Create Supabase Account
- Go to https://supabase.com
- Sign up → Create project → Wait 2 minutes

### 2. Get API Keys
- Settings → API
- Copy: Project URL, anon key, service_role key

### 3. Add to `.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 4. Run Database Schema
- Supabase Dashboard → SQL Editor
- Copy/paste `supabase/schema.sql`
- Click "Run"

### 5. Create Storage Bucket
- Storage → Create bucket
- Name: `audio-files`
- Public: Yes

### 6. Upload Your Files
```bash
cd web
node scripts/upload-audio-to-supabase.mjs
```

## ✅ Done!

Your audio files are now in Supabase Storage, and purchases are saved to the database.

## 📊 Cost

- **Free Tier:** $0/month (1GB storage, 500MB database)
- **After Free:** ~$0.19/month per 10GB storage

## 📚 Full Guide

See `SUPABASE_SETUP_GUIDE.md` for detailed instructions.

