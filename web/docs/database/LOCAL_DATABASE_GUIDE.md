# Local Database Guide

This guide explains how to export Supabase data to local JSON files and work with it locally.

## Overview

The local database system allows you to:
- ✅ Export all Supabase data to local JSON files
- ✅ Work with data offline without Supabase connection
- ✅ Import data back to Supabase when needed
- ✅ Use a local database client for development

## Quick Start

### 1. Export Data from Supabase

```bash
node scripts/export-supabase-to-local.mjs
```

This will:
- Export all tables (`audio_files`, `purchases`) to JSON files
- Save files to `data/supabase-export/`
- Create a summary file with metadata

**Output:**
```
data/supabase-export/
├── export-summary.json    # Metadata about the export
├── all-data.json          # Combined export of all tables
├── audio_files.json       # All audio file records
└── purchases.json         # All purchase records
```

### 2. Set Up Local Database Client

```bash
node scripts/setup-local-database.mjs
```

This creates `lib/local-db.ts` - a local database client that works with the exported JSON files.

### 3. Use Local Database in Your Code

```typescript
import { LocalDB } from '@/lib/local-db'

// Query audio files
const tracks = await LocalDB.query({
  table: 'audio_files',
  filters: { artist: 'SERGIK' },
  limit: 10,
  orderBy: 'created_at',
  orderDirection: 'desc'
})

// Find by ID
const track = await LocalDB.findById('audio_files', trackId)

// Get all records
const allTracks = await LocalDB.getAll('audio_files')

// Count records
const count = await LocalDB.count('audio_files', { artist: 'SERGIK' })
```

## Scripts

### Export Script

**File:** `scripts/export-supabase-to-local.mjs`

Exports all Supabase tables to local JSON files.

```bash
node scripts/export-supabase-to-local.mjs
```

**What it does:**
- Connects to Supabase using service role key
- Exports all data from `audio_files` and `purchases` tables
- Saves individual table files and combined export
- Creates export summary with metadata

**Requirements:**
- `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

### Import Script

**File:** `scripts/import-local-to-supabase.mjs`

Imports local JSON data back into Supabase.

```bash
# Import all tables
node scripts/import-local-to-supabase.mjs

# Import specific table
node scripts/import-local-to-supabase.mjs --table=audio_files

# Clear existing data first (WARNING: deletes all data!)
node scripts/import-local-to-supabase.mjs --clear
```

**Options:**
- `--clear` or `-c`: Delete all existing data before importing
- `--table=<name>`: Import only specific table

**⚠️ Warning:** The `--clear` flag will DELETE all existing data in the specified tables!

### Setup Script

**File:** `scripts/setup-local-database.mjs`

Sets up the local database client utility.

```bash
node scripts/setup-local-database.mjs
```

Creates `lib/local-db.ts` with LocalDB class for working with exported data.

## Local Database Client API

### LocalDB.query(options)

Query data with filters, sorting, and pagination.

```typescript
const results = await LocalDB.query({
  table: 'audio_files',
  filters: { artist: 'SERGIK', format: 'WAV' },
  limit: 20,
  offset: 0,
  orderBy: 'created_at',
  orderDirection: 'desc'
})
```

**Options:**
- `table` (required): Table name
- `filters` (optional): Object with column:value pairs
- `limit` (optional): Maximum number of results
- `offset` (optional): Skip N results
- `orderBy` (optional): Column to sort by
- `orderDirection` (optional): 'asc' or 'desc'

### LocalDB.findById(table, id)

Find a single record by ID.

```typescript
const track = await LocalDB.findById('audio_files', 'uuid-here')
```

### LocalDB.getAll(table)

Get all records from a table.

```typescript
const allTracks = await LocalDB.getAll('audio_files')
```

### LocalDB.count(table, filters?)

Count records matching filters.

```typescript
const count = await LocalDB.count('audio_files', { artist: 'SERGIK' })
```

## File Structure

```
web/
├── data/
│   └── supabase-export/
│       ├── export-summary.json    # Export metadata
│       ├── all-data.json          # Combined export
│       ├── audio_files.json       # Audio files data
│       └── purchases.json         # Purchases data
├── lib/
│   └── local-db.ts                # Local database client
└── scripts/
    ├── export-supabase-to-local.mjs
    ├── import-local-to-supabase.mjs
    └── setup-local-database.mjs
```

## Use Cases

### 1. Offline Development

Work on features without needing Supabase connection:

```typescript
// Use local data when Supabase is unavailable
import { LocalDB } from '@/lib/local-db'

const tracks = await LocalDB.getAll('audio_files')
```

### 2. Data Backup

Regularly export data as backup:

```bash
# Add to cron or scheduled task
node scripts/export-supabase-to-local.mjs
```

### 3. Data Migration

Export from one Supabase project, import to another:

```bash
# On source project
node scripts/export-supabase-to-local.mjs

# Update .env.local with new project credentials
# On destination project
node scripts/import-local-to-supabase.mjs
```

### 4. Testing

Use local data for testing without hitting Supabase:

```typescript
// In tests
import { LocalDB } from '@/lib/local-db'

const testTracks = await LocalDB.query({
  table: 'audio_files',
  limit: 10
})
```

## Limitations

⚠️ **Read-Only:** The local database client is read-only. To update data:
1. Edit JSON files manually
2. Use import script to sync back to Supabase

⚠️ **No Real-time:** Local data doesn't update automatically. Re-export to get latest data.

⚠️ **No Relationships:** Complex queries with joins are not supported. Use simple filters only.

## Best Practices

1. **Regular Exports:** Export data regularly to keep local copy up-to-date
2. **Version Control:** Don't commit large JSON files to git (add to `.gitignore`)
3. **Backup:** Keep export files as backup before major changes
4. **Sync Strategy:** Decide when to use local vs Supabase (e.g., local for dev, Supabase for prod)

## Troubleshooting

### "Missing Supabase environment variables"
- Check `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### "Export files not found"
- Run export script first: `node scripts/export-supabase-to-local.mjs`

### "Error loading table"
- Check that JSON files exist in `data/supabase-export/`
- Verify JSON files are valid (not corrupted)

### Import fails
- Check Supabase connection
- Verify table schemas match
- Check for duplicate IDs or constraint violations

## Next Steps

1. ✅ Export your data: `node scripts/export-supabase-to-local.mjs`
2. ✅ Set up local client: `node scripts/setup-local-database.mjs`
3. ✅ Start using LocalDB in your code
4. ✅ Schedule regular exports for backups

