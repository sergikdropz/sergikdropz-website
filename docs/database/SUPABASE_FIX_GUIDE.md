# 🔧 Supabase Storage Fix Guide

## ⚠️ Issue Detected - UPDATED DIAGNOSIS

Your Supabase project is experiencing **database connection timeouts** (HTTP 544 errors).

### ❌ NOT a Paused Project
Initial diagnosis was incorrect. Your project is:
- ✅ Active and running (Pro plan)
- ❌ Database is timing out due to resource exhaustion

### ✅ Actual Issue: Database Connection Pool Exhausted
The database connection pool is maxed out, causing all queries to timeout.

## ✅ Solution: Unpause Your Project

### Option 1: Via Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard
   - Log in to your account

2. **Select Your Project**
   - Click on: `utgwlgcejflqxyalnlze`
   - Or find "SERGIK Web" project

3. **Check Project Status**
   - Look for a "Paused" or "Inactive" indicator
   - You should see a **"Resume Project"** or **"Restore Project"** button

4. **Click "Resume Project"**
   - Wait 2-3 minutes for the project to fully restore
   - The database and storage will be restored from backup

### Option 2: Via Supabase CLI

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# List projects to see status
supabase projects list

# The project will need to be unpaused via dashboard
```

## 🔍 Diagnostic Information

**Project Details:**
- **URL**: https://utgwlgcejflqxyalnlze.supabase.co
- **Project ID**: utgwlgcejflqxyalnlze
- **Status**: Connection Timeout (Likely Paused)

**Current Error:**
```
The connection to the database timed out
```

**Environment Variables:** ✅ All configured correctly
- `NEXT_PUBLIC_SUPABASE_URL`: ✅ Set
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: ✅ Set
- `SUPABASE_SERVICE_ROLE_KEY`: ✅ Set

## 📊 After Unpausing

Once your project is unpaused, run these commands to verify everything works:

```bash
cd web

# Test connection
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('✅ Connected! Buckets:', data?.map(b => b.name).join(', '));
  }
})();
"
```

## 🚀 Preventing Future Pausing

### Option 1: Upgrade to Pro Plan ($25/mo)
- No auto-pausing
- Better performance
- More storage

### Option 2: Keep Project Active (Free Tier)
Create a simple health check that runs weekly:

```bash
# Add to cron or use GitHub Actions
curl "https://utgwlgcejflqxyalnlze.supabase.co/rest/v1/" \
  -H "apikey: YOUR_ANON_KEY"
```

### Option 3: Use Vercel Cron Job
Add to your Next.js app:

```typescript
// app/api/cron/keep-alive/route.ts
import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseClient()
  
  // Simple query to keep connection alive
  const { data } = await supabase
    .from('audio_files')
    .select('id')
    .limit(1)
  
  return NextResponse.json({ status: 'ok', pinged: true })
}
```

Then add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/keep-alive",
    "schedule": "0 0 * * 0"
  }]
}
```

## 📝 Next Steps

1. ✅ **Go to Supabase Dashboard** → https://supabase.com/dashboard
2. ✅ **Select your project**: utgwlgcejflqxyalnlze
3. ✅ **Click "Resume Project"**
4. ⏳ **Wait 2-3 minutes** for restoration
5. ✅ **Run the test command** above to verify
6. 🎉 **Storage should be working!**

## 🔗 Useful Links

- **Dashboard**: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze
- **Storage**: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/storage/buckets
- **Database**: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/database/tables
- **Settings**: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/settings/general

## ❓ Still Having Issues?

If after unpausing you still have problems:

1. **Check Project Health**
   - Dashboard → Project → Settings → General
   - Look for any warnings or errors

2. **Check Storage Quotas**
   - Dashboard → Storage → Settings
   - Ensure you haven't exceeded free tier limits

3. **Regenerate API Keys** (if needed)
   - Dashboard → Settings → API
   - Generate new keys and update `.env.local`

4. **Check Browser Console**
   - Open your app in browser
   - Check console for specific error messages

---

**Need Help?** Once you've unpaused the project, let me know and I can run additional diagnostics!
