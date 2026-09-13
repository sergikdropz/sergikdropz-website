# FTP Scan and Upload to Supabase Guide

This guide explains how to scan an FTP server for audio files and automatically upload them to Supabase Storage.

## Overview

The `ftp-scan-to-supabase.mjs` script:
1. Connects to your FTP server
2. Recursively scans for audio files (MP3, WAV, FLAC, M4A, OGG, AAC, WMA)
3. Downloads files temporarily
4. Uploads each file to Supabase Storage
5. Stores metadata in Supabase database
6. Cleans up temporary files

## Prerequisites

1. **Supabase Setup**
   - Supabase project created
   - `audio-files` bucket created in Storage
   - Database schema run (see `web/supabase/schema.sql`)
   - Environment variables configured (see below)

2. **FTP Server Access**
   - FTP server hostname/IP
   - FTP username and password
   - Port (default: 21)
   - Optional: FTPS support if needed

## Setup

### 1. Install Dependencies

The script requires `basic-ftp` which should already be installed:

```bash
npm install basic-ftp
```

### 2. Configure Environment Variables

Add FTP credentials to `web/.env.local`:

```bash
# FTP Server Configuration
FTP_HOST=ftp.example.com
FTP_USER=your_username
FTP_PASSWORD=your_password
FTP_PORT=21                    # Optional, defaults to 21
FTP_SECURE=false               # Optional, set to true for FTPS
FTP_ROOT_PATH=/                # Optional, root path to scan (default: /)

# Supabase Configuration (already required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 3. Run the Script

```bash
cd web
node scripts/ftp-scan-to-supabase.mjs
```

## How It Works

1. **Connection**: Connects to FTP server using provided credentials
2. **Scanning**: Recursively scans the FTP server starting from `FTP_ROOT_PATH`
3. **Filtering**: Only processes audio files (MP3, WAV, FLAC, M4A, OGG, AAC, WMA)
4. **Download**: Downloads each file to a temporary directory
5. **Upload**: Uploads to Supabase Storage preserving folder structure
6. **Metadata**: Extracts audio metadata (title, artist, duration) and stores in database
7. **Cleanup**: Deletes temporary files after upload

## Features

- ✅ **Recursive Directory Scanning**: Scans all subdirectories
- ✅ **Duplicate Detection**: Skips files already in Supabase
- ✅ **Metadata Extraction**: Extracts title, artist, and duration from audio files
- ✅ **Progress Tracking**: Shows progress for each file
- ✅ **Error Handling**: Continues processing even if individual files fail
- ✅ **File Size Limits**: Respects Supabase file size limits (5GB for Pro plan)
- ✅ **Automatic Cleanup**: Removes temporary files after upload

## Output

The script provides:
- Real-time progress for each file
- Summary statistics at the end:
  - Total files found
  - Successfully uploaded
  - Skipped (already exists)
  - Too large (exceeds limit)
  - Failed uploads
  - Total size uploaded

## Example Output

```
🚀 Starting FTP scan and upload to Supabase...

📡 FTP Server: ftp.example.com:21
👤 FTP User: username
📁 FTP Root Path: /
☁️  Supabase: https://xxxxx.supabase.co

🔌 Connecting to FTP server...
✅ Connected to FTP server

📂 Changed to directory: /audio

🔍 Scanning FTP server for audio files...
📊 Found 42 audio files

📤 Starting upload process...

[1/42] Processing: unreleased/eps/Are We Awake EP/track1.mp3
✅ Uploaded: unreleased/eps/Are We Awake EP/track1.mp3 (5.23MB)
...

============================================================
📊 Upload Summary
============================================================
Total files found: 42
✅ Successfully uploaded: 38
⏭️  Skipped (already exists): 2
⚠️  Too large: 1
❌ Failed: 1
📦 Total size uploaded: 245.67 MB
============================================================
```

## Troubleshooting

### Connection Issues

**Error: "Failed to connect to FTP server"**
- Check FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD
- Verify FTP server is accessible
- Check firewall settings
- For FTPS, set `FTP_SECURE=true`

### Upload Issues

**Error: "Bucket not found"**
- Create `audio-files` bucket in Supabase Dashboard → Storage
- Verify bucket name matches `BUCKET_NAME` in script

**Error: "File too large"**
- Supabase free tier: 50MB limit
- Supabase Pro: 5GB limit
- Large files will be skipped

**Error: "Database insert failed"**
- Verify database schema is set up
- Check `audio_files` table exists
- Verify Supabase credentials

### Performance

- Large files may take time to download/upload
- Script includes delays to avoid rate limiting
- For faster processing, consider running during off-peak hours

## Security Notes

- ⚠️ **Never commit `.env.local` to git** (it contains passwords)
- ⚠️ **Use secure FTP (FTPS)** when possible (`FTP_SECURE=true`)
- ⚠️ **Store credentials securely** in environment variables only

## Next Steps

After uploading files:
1. Files are available in Supabase Storage
2. Metadata is stored in `audio_files` table
3. Files can be accessed via the music library
4. Update `music-library.json` if needed to reference new files

## Related Scripts

- `upload-audio-to-supabase.mjs` - Upload from local directory
- `scan-music-library.mjs` - Scan local files and generate music-library.json

