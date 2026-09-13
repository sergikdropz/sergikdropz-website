# Almost There! Just Need Project URL

## ✅ What You've Provided
- ✅ Service Role Key: `[REDACTED - stored locally]`
- ✅ Anon/Publishable Key: `[REDACTED - stored locally]`

## ⚠️ What We Still Need

**Just 1 more thing:** Your Supabase Project URL

### Format:
```
https://xxxxx.supabase.co
```

### Where to Find It:
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click ⚙️ **Settings** (gear icon, bottom left)
4. Click **API** in the settings menu
5. Look for **Project URL** (usually at the top)
6. Copy it - it looks like: `https://abcdefghijklmnop.supabase.co`

## 🚀 Once You Have It

**Option 1: Add manually**
Edit `web/.env.local` and add:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
```

**Option 2: Run setup script**
```bash
cd web
node scripts/setup-supabase.mjs
```
(It will ask for the URL)

## ✅ Then We Can:
1. Test the connection
2. Set up the database
3. Create storage bucket
4. Upload your audio files

**Just share the Project URL and we're done!** 🎉

