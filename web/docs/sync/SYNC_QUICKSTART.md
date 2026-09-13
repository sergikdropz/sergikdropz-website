# Sync Quick Start Guide

## Quick Commands

### Full Bidirectional Sync
```bash
node scripts/sync-all-bidirectional.mjs
```

### Upload to Production (Local → Supabase)
```bash
node scripts/sync-all-bidirectional.mjs --direction=up
```

### Download from Production (Supabase → Local)
```bash
node scripts/sync-all-bidirectional.mjs --direction=down
```

### Preview Changes (Dry Run)
```bash
node scripts/sync-all-bidirectional.mjs --dry-run
```

### Sync Only Audio Files
```bash
node scripts/sync-all-bidirectional.mjs --audio-only
```

### Sync Only Images
```bash
node scripts/sync-all-bidirectional.mjs --images-only
```

### Export Metadata Only
```bash
node scripts/sync-all-bidirectional.mjs --metadata-only
```

## Common Workflows

### Before Deployment
```bash
# 1. Preview what will be uploaded
node scripts/sync-all-bidirectional.mjs --direction=up --dry-run

# 2. Upload files to production
node scripts/sync-all-bidirectional.mjs --direction=up

# 3. Deploy code
vercel deploy
```

### After Pulling Code
```bash
# 1. Pull latest code
git pull

# 2. Download files from production
node scripts/sync-all-bidirectional.mjs --direction=down
```

### Full Sync (Both Directions)
```bash
# Syncs both ways, resolves conflicts intelligently
node scripts/sync-all-bidirectional.mjs --direction=both
```

## Options Reference

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview changes without making them |
| `--force` | Force overwrite existing files |
| `--direction=up` | Only sync local → Supabase (upload) |
| `--direction=down` | Only sync Supabase → local (download) |
| `--direction=both` | Sync both directions (default) |
| `--audio-only` | Only sync audio files |
| `--images-only` | Only sync images |
| `--metadata-only` | Only sync database metadata |
| `--skip-hash` | Skip file hashing (faster but less accurate) |
| `--conflict=keep-newer` | Conflict resolution: keep-newer (default), keep-local, keep-remote |

## What Gets Synced

### Audio Files
- Location: `web/public/audio/`
- Bucket: `audio-files`
- Database: Updates `audio_files` table with metadata

### Images
- Location: `web/public/images/`
- Bucket: `gallery-images`
- Includes: EP artwork, gallery images

### Metadata
- Exports: `waveform_data`, `sonic_dna`, `bpm`, `original_bpm`, etc.
- Location: `web/data/supabase-export/audio-metadata.json`

## Troubleshooting

**Files not syncing?**
- Use `--force` to overwrite
- Check `data/.sync-state.json` for sync state
- Verify file paths match

**Conflicts?**
- Use `--conflict=keep-newer` (default)
- Or `--conflict=keep-local` / `--conflict=keep-remote`

**Slow sync?**
- Use `--skip-hash` for faster (less accurate) syncs
- Use `--audio-only` or `--images-only` for selective syncs

## Full Documentation

See [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) for complete architecture details.
