# 🚨 EMERGENCY RECOVERY INSTRUCTIONS

## What Happened

The "Resync" button set all `audio_file_id` values to `null` in the database, breaking the links between tracks and audio files. This caused:
- Files not loading
- Music admin not working
- Everything broken

## ✅ Fixes Applied

1. **Sync now preserves audio_file_id** - Future resyncs won't break links
2. **Recovery endpoint created** - `/api/music-library/recover` to restore links
3. **"Restore Audio Links" button** - Added to admin panel

## 🔧 IMMEDIATE RECOVERY STEPS

### Step 1: Wait for Supabase to Come Back Online

The Supabase connection is currently timing out (Error 522). Wait a few minutes and try again.

### Step 2: Check Supabase Status

Visit: https://status.supabase.com/ to see if there are any outages.

### Step 3: Once Supabase is Back, Run Recovery

**Option A: Via Browser (Easiest)**

1. Open your browser
2. Go to: `http://localhost:3001/api/music-library/recover`
3. You should see a status page showing how many tracks need recovery
4. To start recovery, open browser console (F12) and run:
   ```javascript
   fetch('/api/music-library/recover', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```

**Option B: Via Terminal (Recommended)**

```bash
cd "/Users/machd/Documents/SERGIK Web and app/web"
curl -X POST http://localhost:3001/api/music-library/recover
```

**Option C: Via Admin Panel**

1. Go to: `http://localhost:3001/admin/music-library`
2. Click the orange **"Restore Audio Links"** button
3. Wait for it to complete (may take a few minutes)

### Step 4: Verify Recovery

After recovery completes, check the status:

```bash
curl http://localhost:3001/api/music-library/recover
```

This should show `"needsRecovery": false` if successful.

## 🛡️ Prevention

The sync code has been fixed to **preserve existing `audio_file_id` values** when syncing. This means:
- ✅ Future resyncs won't break links
- ✅ Only new tracks will have `null` audio_file_id
- ✅ Existing links are protected

## 📞 If Recovery Fails

If the recovery doesn't work or Supabase stays down:

1. **Check server logs** - Look for error messages in your terminal
2. **Try manual recovery** - Use the link-tracks endpoint directly
3. **Contact support** - If Supabase is down, wait for them to fix it

## 🔍 What the Recovery Does

The recovery endpoint:
1. Finds all tracks with `audio_file_id = null`
2. Matches them to audio files by:
   - File path/URL
   - Filename
   - Title and artist
3. Restores the `audio_file_id` links
4. Reports how many were linked successfully

This should restore everything back to working order!
