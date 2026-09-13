# Get Your Remaining Supabase Keys

## ✅ What You've Provided
- Service Role Key: `[REDACTED - stored locally]` ✅ Added

## ⚠️ What We Still Need

You need 2 more keys from your Supabase dashboard:

### 1. Supabase Project URL
- Format: `https://xxxxx.supabase.co`
- Where to find: Supabase Dashboard → Settings → API → Project URL

### 2. Supabase Anon/Public Key
- Format: Starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Where to find: Supabase Dashboard → Settings → API → anon public key

## 🚀 Quick Steps

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard
   - Select your project

2. **Get the keys:**
   - Click ⚙️ **Settings** (gear icon, bottom left)
   - Click **API** in the settings menu
   - You'll see:
     - **Project URL** (copy this)
     - **anon public** key (copy this - it's long!)

3. **Add them:**
   ```bash
   cd web
   node scripts/setup-supabase.mjs
   ```
   Or manually add to `web/.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   ```

## ✅ Once You Have All 3 Keys

Run this to test:
```bash
cd web
node scripts/test-supabase-connection.mjs
```

Then continue with database and storage setup!

