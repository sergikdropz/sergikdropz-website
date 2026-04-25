# 🗄️ Database Schema Setup - Quick Guide

## ✅ What's Done
- ✅ Supabase connection configured
- ✅ Storage bucket "audio-files" created

## ⚠️ What's Needed
- Database tables need to be created

## 🚀 Quick Setup (2 minutes)

### Option 1: Copy-Paste Method (Easiest)

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard
   - Select your project: `utgwlgcejflqxyalnlze`

2. **Open SQL Editor:**
   - Click "SQL Editor" in left sidebar
   - Click "New query"

3. **Copy the Schema:**
   - Open file: `web/supabase/schema.sql`
   - Select ALL contents (Cmd/Ctrl + A)
   - Copy (Cmd/Ctrl + C)

4. **Paste and Run:**
   - Paste into SQL Editor
   - Click "Run" button (or press Cmd/Ctrl + Enter)
   - Wait for "Success" message

5. **Verify:**
   ```bash
   cd web
   node scripts/test-supabase-connection.mjs
   ```

### Option 2: Direct Link (If Available)
Some Supabase projects allow direct SQL execution via API, but for security, the dashboard method is recommended.

## ✅ After Schema is Set Up

You can then:
1. Upload audio files: `node scripts/upload-audio-to-supabase.mjs`
2. Test everything: `node scripts/test-supabase-connection.mjs`

---

**The schema file is ready at:** `web/supabase/schema.sql`

