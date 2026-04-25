# Playlist Database Migration Guide

## Overview
This guide explains how to add playlist support to your Supabase database.

## Step 1: Run the Database Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `web/supabase/music_library_schema.sql`
4. Find the section starting with `-- MUSIC LIBRARY PLAYLISTS TABLE`
5. Copy and run the playlist table creation SQL in the Supabase SQL Editor

**OR** run the entire updated schema file if you haven't already set up the music library tables.

## Step 2: Verify the Table Was Created

Run this query in Supabase SQL Editor to verify:

```sql
SELECT * FROM music_library_playlists LIMIT 1;
```

If the table exists, you'll see an empty result (or existing playlists if any).

## Step 3: Test the API

The playlist API endpoints are now available:

- **GET** `/api/music-library/playlists` - Fetch all playlists
- **POST** `/api/music-library/playlists` - Create a new playlist
- **PUT** `/api/music-library/playlists` - Update a playlist
- **DELETE** `/api/music-library/playlists?id={id}` - Delete a playlist

## Step 4: Sync Existing Playlists (Optional)

If you have playlists in your `music-library.json` file, you can sync them to the database:

1. The sync route (`POST /api/music-library/sync`) now includes playlist syncing
2. Playlists from JSON will be imported to the database
3. After syncing, playlists will be stored in the database

## What Changed

### Database
- ✅ New table: `music_library_playlists`
- ✅ RLS policies for public read access
- ✅ Auto-update triggers for `updated_at` timestamp

### API
- ✅ New playlist CRUD endpoints
- ✅ Updated sync route to handle playlists
- ✅ Playlists included in library export

### Front-End
- ✅ Playlists now load from database via API
- ✅ Create/update/delete operations use API
- ✅ Real-time sync with database

### Utilities
- ✅ `fetchPlaylists()` function
- ✅ `createPlaylist()` function
- ✅ `updatePlaylist()` function
- ✅ `deletePlaylist()` function

## Troubleshooting

### Playlists not showing up?
1. Check that the table was created: `SELECT * FROM music_library_playlists;`
2. Check browser console for API errors
3. Verify RLS policies are set correctly

### Can't create playlists?
1. Check that you're using the service role key (for admin operations)
2. Verify the API endpoint is accessible
3. Check browser console for error messages

### Playlists not syncing from JSON?
1. Ensure the JSON file has a `playlists` array
2. Run the sync endpoint: `POST /api/music-library/sync`
3. Check the response for any errors

## Next Steps

After migration:
1. ✅ Playlists are stored in database
2. ✅ Front-end loads playlists from API
3. ✅ Admin can manage playlists via database
4. ✅ All playlist operations are persistent

---

**Note**: Make sure to run the SQL migration before using playlist features!
