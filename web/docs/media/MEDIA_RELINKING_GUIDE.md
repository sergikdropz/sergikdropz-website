# Media Relinking Guide

## Problem

All media links are broken in production:
- Audio files return 404
- Images don't load
- Waveforms, Sonic DNA, and BPM data are missing
- Files exist in Supabase but paths don't match

## Solution

We've created comprehensive scripts to scan Supabase and relink everything.

## Quick Fix

Run the master script to fix everything at once:

```bash
cd web
node scripts/fix-all-media-links.mjs
```

For a dry run (see what would change without making changes):

```bash
node scripts/fix-all-media-links.mjs --dry-run
```

## Step-by-Step

### 1. Relink Audio Files

This script:
- Scans all files in Supabase Storage (`audio-files` bucket)
- Scans all records in Supabase Database (`audio_files` table)
- Matches them with `music-library.json`
- Updates `file_path` and `file_url` to ensure they're correct
- Creates missing database records
- Updates metadata (title, artist, duration, BPM) from library

```bash
# Dry run first
node scripts/relink-all-media.mjs --dry-run

# Apply changes
node scripts/relink-all-media.mjs
```

### 2. Fix Image Paths

Large EP artwork images are excluded from Vercel deployment (too large). This script:
- Updates image paths to use Supabase Storage URLs (if `--use-supabase` flag)
- Or marks them for manual optimization

```bash
# Just note which images will 404
node scripts/fix-image-paths.mjs

# Use Supabase Storage URLs (if images are uploaded to Supabase)
node scripts/fix-image-paths.mjs --use-supabase
```

### 3. Verify Everything

```bash
# Check Supabase Storage
node scripts/verify-supabase-files.mjs

# Check analysis progress
node scripts/check-analysis-progress.mjs
```

## What Gets Fixed

### Audio Files
- ✅ `file_path` - Corrected to match Supabase Storage paths
- ✅ `file_url` - Regenerated Supabase Storage URLs
- ✅ `title`, `artist`, `duration` - Updated from `music-library.json`
- ✅ `bpm` - Synced from library data
- ✅ Missing records - Created for files in storage but not in database

### Images
- ✅ EP artwork paths - Updated to Supabase URLs (if using `--use-supabase`)
- ⚠️ Large images - Marked for optimization or Supabase upload

### Database Records
- ✅ Path mismatches - Fixed
- ✅ Missing URLs - Generated
- ✅ Orphaned records - Identified (files in DB but not in storage)

## Troubleshooting

### "Missing Supabase environment variables"
Make sure `.env.local` has:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### "Files in storage but not in database"
The script will create database records automatically. Run without `--dry-run` to apply.

### "Files in database but not in storage"
These are orphaned records. The script will identify them. You may need to:
1. Re-upload the files to Supabase Storage
2. Or delete the database records if files are no longer needed

### "Images still 404"
Large EP artwork images are excluded from Vercel deployment. Options:
1. **Optimize images** - Compress to <500KB each
2. **Upload to Supabase** - Upload to `gallery-images` bucket and use `--use-supabase` flag
3. **Use CDN** - Upload to Cloudflare R2 or similar

## After Relinking

1. **Test audio playback** - Visit `/music-library` and try playing tracks
2. **Check images** - Verify EP artwork loads
3. **Verify waveforms** - Check if waveform visualization works
4. **Check Sonic DNA** - Ensure analysis data loads

## Manual Fixes

If automatic relinking doesn't work, you can manually:

1. **Check file paths in Supabase Storage**:
   - Go to Supabase Dashboard → Storage → `audio-files`
   - Note the exact paths

2. **Update database records**:
   ```sql
   UPDATE audio_files 
   SET file_path = 'correct/path/here.wav',
       file_url = 'https://xxxxx.supabase.co/storage/v1/object/public/audio-files/correct/path/here.wav'
   WHERE id = 'record-id';
   ```

3. **Verify URLs work**:
   - Copy `file_url` from database
   - Paste in browser - should download/play the file

## Next Steps

After relinking:
1. ✅ All audio files should play
2. ✅ Images should load (or be marked for optimization)
3. ✅ Waveforms should generate
4. ✅ Sonic DNA should load
5. ✅ BPM data should be available

If issues persist, check:
- Supabase Storage bucket permissions
- Database RLS policies
- Environment variables in Vercel
- Network tab in browser for actual error messages
