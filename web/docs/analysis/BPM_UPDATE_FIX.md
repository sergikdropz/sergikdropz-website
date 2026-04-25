# BPM Update 404 Error - Quick Fix

## Issue
Getting `404 (Not Found)` when trying to update BPM via the API route `/api/audio/update-bpm`.

## Solution

The route file exists and is correct. Next.js just needs to pick it up. **Restart your dev server:**

```bash
# Stop the current server (Ctrl+C)
cd web
npm run dev
```

If that doesn't work, clear the Next.js cache:

```bash
cd web
rm -rf .next
npm run dev
```

## What's Already Fixed

✅ **Route file exists**: `web/app/api/audio/update-bpm/route.ts`
✅ **Error handling**: Distinguishes between database tracks (UUID) and local tracks (file paths)
✅ **Local tracks**: Updates local state only (no API call needed)
✅ **Better errors**: Clear messages for route not found vs track not found

## How It Works Now

1. **Database tracks** (UUID format): Updates BPM in Supabase database
2. **Local tracks** (file paths): Updates local state only (no API call)
3. **Error messages**: Clear feedback if route isn't found or track doesn't exist

## Testing

After restarting the server:

1. Play a track from the database (should have UUID ID)
2. Expand player controls
3. Click on BPM value to edit
4. Enter new BPM and save
5. Should update successfully!

If you're still seeing 404 after restart, check:
- Is the dev server running on the correct port?
- Are there any build errors in the terminal?
- Try accessing the route directly: `http://localhost:3000/api/audio/update-bpm` (should return 400 for missing params, not 404)

