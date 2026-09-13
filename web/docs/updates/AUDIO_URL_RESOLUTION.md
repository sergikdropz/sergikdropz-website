# Audio URL Resolution System

## Overview

This system automatically resolves local audio file paths to Supabase Storage URLs in production, while maintaining compatibility with local files in development.

## How It Works

1. **API Route** (`/api/audio/resolve`): Resolves local file paths to Supabase URLs
   - Checks Supabase database for file metadata
   - Falls back to constructing URLs from storage paths
   - Returns `null` if not found (falls back to local path)

2. **Utility Function** (`utils/resolveAudioUrl.ts`): Client-side URL resolution
   - Tries to resolve from Supabase via API
   - Falls back to local paths if resolution fails
   - Works in both development and production

3. **Updated Components**: All audio players now use URL resolution
   - `MusicPlayer` - Main player in Music Library Vault
   - `SoundCloudPlayer` - Used in Unreleased Music section
   - `AudioPlayer` - Used in Purchasable Tracks

## Benefits

- **Development**: Uses local files from `public/audio/`
- **Production**: Automatically uses Supabase Storage URLs
- **Fallback**: If Supabase URL fails, tries local path
- **No Breaking Changes**: Existing code continues to work

## File Path Format

The system handles paths in these formats:
- `/audio/unreleased/eps/SERGIK - Are We Awake/SERGIK - It Is What It Is.wav`
- `audio/unreleased/eps/...` (without leading slash)
- Full URLs (https://...) - passed through unchanged

## Setup Requirements

For production to work properly:

1. **Upload files to Supabase Storage**:
   ```bash
   cd web
   node scripts/upload-audio-to-supabase.mjs
   ```

2. **Ensure Supabase is configured**:
   - `NEXT_PUBLIC_SUPABASE_URL` in environment variables
   - `audio-files` bucket created in Supabase Storage
   - Storage policies set up (see `web/supabase/storage-policies.sql`)

## Troubleshooting

- **Songs don't play in production**: Check if files are uploaded to Supabase Storage
- **404 errors**: Verify file paths match between `music-library.json` and Supabase Storage
- **Local files work but Supabase doesn't**: Check Supabase environment variables and bucket configuration

