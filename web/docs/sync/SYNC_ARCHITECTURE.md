# Bidirectional Synchronization Architecture

## Overview

This document describes the comprehensive bidirectional synchronization system that keeps local development files and Supabase production files consistently in sync. The system handles audio files, images, and database metadata with intelligent change detection and conflict resolution.

## Architecture Design

### Core Principles

1. **Bidirectional Sync**: Files can flow in both directions (local → Supabase, Supabase → local)
2. **Efficient Change Detection**: Uses file hashing (MD5) to detect changes without unnecessary transfers
3. **Sync State Tracking**: Maintains a state file to track what has been synced and when
4. **Conflict Resolution**: Intelligent handling of conflicts between local and remote versions
5. **Incremental Updates**: Only syncs files that have changed since last sync

### Components

#### 1. Main Sync Script: `sync-all-bidirectional.mjs`

The comprehensive sync script that orchestrates all synchronization operations.

**Features:**
- Audio file synchronization (bidirectional)
- Image synchronization (bidirectional)
- Database metadata export/import
- File hashing for change detection
- Sync state persistence
- Conflict resolution strategies

**Usage:**
```bash
# Full bidirectional sync
node scripts/sync-all-bidirectional.mjs

# Upload only (local → Supabase)
node scripts/sync-all-bidirectional.mjs --direction=up

# Download only (Supabase → local)
node scripts/sync-all-bidirectional.mjs --direction=down

# Audio files only
node scripts/sync-all-bidirectional.mjs --audio-only

# Dry run (preview changes)
node scripts/sync-all-bidirectional.mjs --dry-run

# Force overwrite existing files
node scripts/sync-all-bidirectional.mjs --force
```

#### 2. Sync State File: `data/.sync-state.json`

Tracks synchronization state to enable incremental updates:

```json
{
  "lastSync": "2024-01-15T10:30:00.000Z",
  "audioHashes": {
    "path/to/file.wav": "abc123def456..."
  },
  "imageHashes": {
    "audio/unreleased/eps/artwork.jpg": "xyz789..."
  },
  "metadataVersion": "2024-01-15T10:30:00.000Z"
}
```

**Purpose:**
- Track which files have been synced
- Store file hashes to detect changes
- Enable incremental syncs (only changed files)
- Prevent unnecessary transfers

#### 3. File Hashing

Uses MD5 hashing to detect file changes:

- **With hashing** (default): Calculates MD5 hash of file contents
- **Without hashing** (`--skip-hash`): Uses size + modified time (faster but less accurate)

**Why hashing?**
- Detects content changes even if size/modified time are the same
- More reliable than size-only comparison
- Enables true incremental syncs

#### 4. Conflict Resolution

When a file exists in both local and remote with different content:

- **`keep-newer`** (default): Keeps the version with the newer modified time
- **`keep-local`**: Always prefer local version
- **`keep-remote`**: Always prefer remote version

**Usage:**
```bash
node scripts/sync-all-bidirectional.mjs --conflict=keep-newer
```

## Synchronization Flow

### Audio Files

1. **Scan Local Files**
   - Recursively scan `web/public/audio/`
   - Calculate hashes for each file
   - Build map of local files

2. **List Remote Files**
   - Query Supabase Storage `audio-files` bucket
   - Recursively list all files
   - Build map of remote files

3. **Compare & Sync**
   - **Upload**: Files in local but not remote, or changed (hash mismatch)
   - **Download**: Files in remote but not local
   - **Update Database**: Update `audio_files` table with metadata

4. **Update Sync State**
   - Store hashes of synced files
   - Update last sync timestamp

### Images

1. **Scan Local Files**
   - Recursively scan `web/public/images/`
   - Focus on EP artwork and gallery images
   - Calculate hashes

2. **List Remote Files**
   - Query Supabase Storage `gallery-images` bucket
   - List all image files

3. **Compare & Sync**
   - **Upload**: Missing or changed images
   - **Download**: Missing local images
   - **Path Mapping**: Convert between local paths (`images/...`) and storage paths

4. **Update Sync State**
   - Store image hashes
   - Track sync status

### Database Metadata

1. **Export from Supabase**
   - Query `audio_files` table for metadata:
     - `waveform_data` (JSONB)
     - `sonic_dna` (JSONB)
     - `bpm`, `original_bpm`
     - `key_signature`, `energy_level`, `danceability`
     - `frequency_bands`
   - Export to `data/supabase-export/audio-metadata.json`

2. **Import to Local** (future enhancement)
   - Read exported metadata
   - Update local files or database as needed

## Service Worker Role

**Important**: Service workers are **NOT** part of the synchronization pipeline. They are client-side caching mechanisms for performance.

### Service Worker Purpose

- **Client-side caching**: Cache audio files in browser for offline playback
- **Performance optimization**: Reduce network requests for frequently played tracks
- **LRU eviction**: Manage cache size (500MB limit, 20 items max)

### Separation of Concerns

- **Server-side sync** (`sync-all-bidirectional.mjs`): Keeps files in sync between local and Supabase
- **Client-side cache** (`sw.js`): Optimizes playback performance in browser

**Why separate?**
- Sync happens during development/deployment
- Caching happens during user interaction
- Different concerns, different layers

## Best Practices

### 1. Regular Syncs

Run sync before and after:
- Code deployments
- Major file changes
- Working on different machines
- After pulling from git

```bash
# Quick sync before deployment
node scripts/sync-all-bidirectional.mjs --direction=up

# Full sync after pulling changes
node scripts/sync-all-bidirectional.mjs --direction=both
```

### 2. Dry Run First

Always preview changes before syncing:

```bash
node scripts/sync-all-bidirectional.mjs --dry-run
```

### 3. Selective Syncing

Use flags to sync only what you need:

```bash
# Only sync audio files
node scripts/sync-all-bidirectional.mjs --audio-only

# Only sync images
node scripts/sync-all-bidirectional.mjs --images-only

# Only export metadata
node scripts/sync-all-bidirectional.mjs --metadata-only
```

### 4. Conflict Resolution

Choose the right conflict resolution strategy:

- **Development**: `keep-newer` (default) - most flexible
- **Production push**: `keep-local` - ensure local changes are pushed
- **Production pull**: `keep-remote` - ensure production is source of truth

### 5. File Hashing

- **Default**: Use hashing for accurate change detection
- **Fast mode**: Use `--skip-hash` only for quick checks (less accurate)

## Workflow Examples

### Scenario 1: Local Development → Production

```bash
# 1. Make changes locally
# 2. Preview what will be synced
node scripts/sync-all-bidirectional.mjs --direction=up --dry-run

# 3. Sync to production
node scripts/sync-all-bidirectional.mjs --direction=up

# 4. Deploy code
vercel deploy
```

### Scenario 2: Production → Local Development

```bash
# 1. Pull latest code
git pull

# 2. Sync files from production
node scripts/sync-all-bidirectional.mjs --direction=down

# 3. Continue development
```

### Scenario 3: Full Bidirectional Sync

```bash
# Sync both directions (handles conflicts intelligently)
node scripts/sync-all-bidirectional.mjs --direction=both
```

### Scenario 4: Metadata Export

```bash
# Export all metadata from Supabase
node scripts/sync-all-bidirectional.mjs --metadata-only

# Review exported metadata
cat data/supabase-export/audio-metadata.json
```

## Troubleshooting

### Files Not Syncing

1. **Check sync state**: Review `data/.sync-state.json`
2. **Force sync**: Use `--force` flag
3. **Check hashes**: Verify file hashes are being calculated
4. **Check paths**: Ensure file paths match between local and remote

### Conflicts

1. **Review conflicts**: Check console output for conflict warnings
2. **Choose strategy**: Use appropriate `--conflict` flag
3. **Manual resolution**: Manually resolve if needed

### Performance

1. **Skip hashing**: Use `--skip-hash` for faster syncs (less accurate)
2. **Selective sync**: Use `--audio-only` or `--images-only`
3. **Dry run first**: Always preview before full sync

## File Structure

```
web/
├── scripts/
│   └── sync-all-bidirectional.mjs    # Main sync script
├── data/
│   ├── .sync-state.json              # Sync state tracking
│   └── supabase-export/
│       └── audio-metadata.json       # Exported metadata
├── public/
│   ├── audio/                        # Local audio files
│   └── images/                       # Local images
└── SYNC_ARCHITECTURE.md              # This file
```

## Future Enhancements

1. **Metadata Import**: Import metadata from exports back to Supabase
2. **Incremental Metadata Sync**: Only sync changed metadata fields
3. **Parallel Transfers**: Upload/download multiple files in parallel
4. **Progress Bar**: Visual progress indicator for large syncs
5. **Sync Scheduling**: Automated periodic syncs
6. **Conflict UI**: Interactive conflict resolution

## Related Files

- `web/scripts/sync-local-to-supabase.mjs` - Original one-way sync (legacy)
- `web/scripts/export-supabase-to-local.mjs` - Metadata export (legacy)
- `web/scripts/upload-ep-artwork-to-supabase.mjs` - Image upload (legacy)
- `web/public/sw.js` - Service worker (client-side caching)
- `web/utils/serviceWorker.ts` - Service worker utilities
- `web/supabase/schema.sql` - Database schema

## Summary

The bidirectional synchronization system provides:

✅ **Bidirectional sync** between local and Supabase  
✅ **Efficient change detection** using file hashing  
✅ **Sync state tracking** for incremental updates  
✅ **Conflict resolution** with multiple strategies  
✅ **Selective syncing** (audio, images, metadata)  
✅ **Dry run mode** for safe previews  

This architecture ensures files are always in sync, preventing the common problem of files being lost or desynchronized during code updates and deployments.
