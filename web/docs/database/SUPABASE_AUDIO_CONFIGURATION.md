# Supabase Audio Files Configuration

## Overview

This website is configured to use **Supabase Storage** as the primary source for all audio files in production. Local audio files are excluded from Vercel deployments and should only be used for local development.

## Configuration Status

✅ **Production**: All audio files are served from Supabase Storage  
✅ **Development**: Falls back to local files if Supabase resolution fails  
✅ **Storage Bucket**: `audio-files`  
✅ **Database Table**: `audio_files`  

## How It Works

### 1. Audio URL Resolution

The `resolveAudioUrl()` utility function:
- **Production**: Always resolves to Supabase Storage URLs
- **Development**: Tries Supabase first, falls back to local files
- Handles both database lookups and direct storage URL construction

### 2. API Route: `/api/audio/resolve`

- Queries `audio_files` table for file metadata
- Falls back to constructing Supabase Storage URLs directly
- Returns Supabase URLs in production, null in development (for local fallback)

### 3. Components

All audio players use Supabase URLs:
- `MusicPlayer` - Main music library player
- `SoundCloudPlayer` - Unreleased music section
- `AudioPlayer` - Purchasable tracks

### 4. Storage Bucket

- **Name**: `audio-files`
- **Access**: Public read access (for streaming)
- **Location**: Supabase Storage
- **Policies**: See `web/supabase/storage-policies.sql`

## Important Notes

1. **No Local Fallback in Production**: The code will NOT fall back to local files in production because:
   - Local audio files are excluded from Vercel deployments (`.vercelignore`)
   - All audio must be uploaded to Supabase Storage

2. **File Upload**: Use the upload script to add files to Supabase:
   ```bash
   cd web
   node scripts/upload-audio-to-supabase.mjs
   ```

3. **Database Sync**: Files should be registered in the `audio_files` table for best performance, but the system can also construct URLs directly from storage paths.

## Verification

To verify Supabase is being used:
1. Check browser network tab - audio requests should go to `*.supabase.co` domains
2. Check Supabase Storage dashboard - files should be in `audio-files` bucket
3. Check database - `audio_files` table should have metadata entries

## Troubleshooting

**Audio files not playing in production:**
- Verify files are uploaded to Supabase Storage
- Check `audio-files` bucket exists and is public
- Verify file paths match between `music-library.json` and Supabase Storage
- Check browser console for errors

**404 errors on audio files:**
- Ensure files are uploaded to Supabase
- Verify storage policies allow public read access
- Check file paths are correct (no typos, correct case)

