# Music Library Backend Setup Guide

This guide explains how to set up and use the backend database system for managing your music library structure.

## Overview

The music library backend provides:
- ✅ Database storage for folders and tracks
- ✅ API endpoints for CRUD operations
- ✅ Sync between JSON file and database
- ✅ Hidden folder support (for admin/backend folders)
- ✅ Full control over library structure

## Setup Steps

### 1. Create Database Tables

Run the SQL schema in Supabase:

```bash
# Go to Supabase Dashboard → SQL Editor
# Copy and paste the contents of:
web/supabase/music_library_schema.sql
# Click "Run"
```

This creates:
- `music_library_folders` - Stores folder hierarchy
- `music_library_tracks` - Stores track metadata
- Views and indexes for performance

### 2. Sync Existing JSON to Database

After creating the tables, sync your existing `music-library.json`:

```bash
cd web
node scripts/sync-music-library-to-db.mjs
```

This will:
- Import all folders from JSON
- Import all tracks from JSON
- Preserve the hierarchical structure
- Show progress and statistics

### 3. Verify Setup

Check that data was imported:

```bash
# In Supabase Dashboard → Table Editor
# Check:
# - music_library_folders (should have your folders)
# - music_library_tracks (should have your tracks)
```

## API Endpoints

### Folders

**GET** `/api/music-library/folders`
- Get all folders (hidden folders filtered by default)
- Query: `?includeHidden=true` (admin only)

**POST** `/api/music-library/folders`
- Create a new folder
- Body: `{ id, name, type, parentId?, hidden?, artwork?, year?, displayOrder? }`

**PUT** `/api/music-library/folders`
- Update a folder
- Body: `{ id, ...updates }`

**DELETE** `/api/music-library/folders?id=folder-id`
- Delete a folder (cascades to children and tracks)

### Tracks

**GET** `/api/music-library/tracks`
- Get all tracks
- Query: `?folderId=xxx` (filter by folder)

**POST** `/api/music-library/tracks`
- Create a new track
- Body: `{ id, folderId, title, fileUrl, ...metadata }`

**PUT** `/api/music-library/tracks`
- Update a track
- Body: `{ id, ...updates }`

**DELETE** `/api/music-library/tracks?id=track-id`
- Delete a track

### Sync

**POST** `/api/music-library/sync`
- Import JSON file to database
- Body: `{ filePath? }` (optional, defaults to `data/music-library.json`)

**GET** `/api/music-library/sync`
- Export database to JSON format
- Returns: `{ description, folders, playlists }`

## Usage Examples

### Create a Folder via API

```typescript
const response = await fetch('/api/music-library/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'folder-new-collection',
    name: 'New Collection',
    type: 'folder',
    parentId: 'folder-discography',
    hidden: false
  })
})
```

### Add Track to Folder

```typescript
const response = await fetch('/api/music-library/tracks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'track-new-track',
    folderId: 'folder-all-tracks',
    title: 'New Track',
    artist: 'SERGIK',
    fileUrl: 'https://...',
    duration: 240
  })
})
```

### Sync JSON to Database

```typescript
const response = await fetch('/api/music-library/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filePath: '/path/to/music-library.json'
  })
})
```

## Scripts

### Add "All Tracks" Folder

```bash
cd web
node scripts/add-all-tracks-folder.mjs
```

This creates an "All Tracks" folder under Discography containing all tracks from the library.

### Sync to Database

```bash
cd web
node scripts/sync-music-library-to-db.mjs
```

This syncs the JSON file to the database.

## Database Schema

### music_library_folders

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (folder ID) |
| name | TEXT | Folder name |
| type | TEXT | 'folder', 'album', 'ep', 'single', 'remix', 'track' |
| parent_id | TEXT | Parent folder ID (nullable) |
| hidden | BOOLEAN | Hide from frontend (default: false) |
| artwork_url | TEXT | Artwork URL (nullable) |
| year | INTEGER | Year (nullable) |
| display_order | INTEGER | Sort order |
| metadata | JSONB | Additional metadata |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### music_library_tracks

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (track ID) |
| folder_id | TEXT | Parent folder ID |
| audio_file_id | UUID | Link to audio_files table (nullable) |
| title | TEXT | Track title |
| artist | TEXT | Artist name |
| duration | INTEGER | Duration in seconds |
| file_url | TEXT | Audio file URL |
| artwork_url | TEXT | Artwork URL (nullable) |
| bpm | INTEGER | BPM (nullable) |
| key_signature | TEXT | Key signature (nullable) |
| sonic_dna | JSONB | Sonic DNA analysis (nullable) |
| waveform | JSONB | Waveform data (nullable) |
| energy_level | DECIMAL | Energy level (nullable) |
| danceability | DECIMAL | Danceability (nullable) |
| created_at | TIMESTAMP | Creation date (nullable) |
| date | TEXT | Date string (nullable) |
| year | INTEGER | Year (nullable) |
| display_order | INTEGER | Sort order |
| metadata | JSONB | Additional metadata |
| created_at_timestamp | TIMESTAMP | Record creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

## Security

- **Public Access**: Non-hidden folders and all tracks are publicly readable
- **Admin Access**: Service role key required for create/update/delete operations
- **RLS Policies**: Row Level Security enabled on both tables

## Next Steps

1. ✅ Run the database schema
2. ✅ Sync your JSON to database
3. ✅ Test API endpoints
4. 🔄 Build admin UI (optional)
5. 🔄 Update frontend to use API (optional)

## Troubleshooting

### Tables don't exist
- Make sure you ran the SQL schema in Supabase
- Check Supabase Dashboard → Table Editor

### Sync fails
- Check environment variables are set
- Verify Supabase connection
- Check error messages in console

### API returns 500
- Check Supabase service role key is correct
- Verify RLS policies are set up
- Check server logs for detailed errors
