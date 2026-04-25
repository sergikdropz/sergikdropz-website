# Music Library Backend - Quick Start 🚀

## 5-Minute Setup

### Step 1: Verify Database Tables

```bash
cd web
node scripts/verify-database-setup.mjs
```

If tables don't exist, you'll see instructions to create them.

### Step 2: Create Tables (if needed)

1. Go to **Supabase Dashboard → SQL Editor**
2. Copy contents of `web/supabase/music_library_schema.sql`
3. Paste and click **"Run"**

### Step 3: Sync JSON to Database

```bash
cd web
node scripts/sync-music-library-to-db.mjs
```

This imports all folders and tracks from `music-library.json`.

### Step 4: Access Admin Panel

Open in browser:
```
http://localhost:3000/admin/music-library
```

## What You Can Do

### Admin Panel Features
- ✅ View all folders (including hidden ones)
- ✅ Create/Edit/Delete folders
- ✅ Create/Edit/Delete tracks
- ✅ Sync JSON to database
- ✅ Manage folder hierarchy

### API Endpoints
- `GET /api/music-library/folders` - List folders
- `POST /api/music-library/folders` - Create folder
- `PUT /api/music-library/folders` - Update folder
- `DELETE /api/music-library/folders?id=xxx` - Delete folder
- `GET /api/music-library/tracks` - List tracks
- `POST /api/music-library/tracks` - Create track
- `PUT /api/music-library/tracks` - Update track
- `DELETE /api/music-library/tracks?id=xxx` - Delete track
- `POST /api/music-library/sync` - Import JSON to DB
- `GET /api/music-library/sync` - Export DB to JSON

## Current Status

✅ **Completed:**
- Database schema created
- API endpoints implemented
- Admin panel built
- "All Tracks" folder added (295 tracks)
- Sync scripts ready
- Verification script ready

## Environment Variables

Make sure these are in `web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## Troubleshooting

### "Tables don't exist"
→ Run the SQL schema in Supabase Dashboard

### "Sync fails"
→ Check environment variables are set correctly
→ Verify Supabase connection

### "Admin panel shows nothing"
→ Run sync script first
→ Check browser console for errors

## Next Steps

1. ✅ Run verification script
2. ✅ Create database tables (if needed)
3. ✅ Sync JSON to database
4. ✅ Test admin panel
5. 🔄 (Optional) Enable API mode in frontend

To enable API mode in frontend, add to `web/.env.local`:
```bash
NEXT_PUBLIC_USE_MUSIC_LIBRARY_API=true
```

Then the frontend will fetch from API instead of JSON file.

---

**Ready to go!** 🎉
