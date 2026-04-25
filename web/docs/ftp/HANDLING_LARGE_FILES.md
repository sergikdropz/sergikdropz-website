# Handling Large Audio Files

## Problem

Some audio files (especially WAV files) exceed Supabase's default file size limit of 50MB. When uploading, you'll see errors like:

```
❌ Error uploading unreleased/Playlists/Deep n Funky/JIMII x Sergik - dublin.wav: The object exceeded the maximum allowed size
```

## Solutions

### Option 1: Compress Files (Recommended)

Convert large WAV files to compressed formats like MP3 or FLAC:

**Using FFmpeg (if installed):**
```bash
# Convert WAV to MP3 (320kbps, high quality)
ffmpeg -i "input.wav" -b:a 320k "output.mp3"

# Convert WAV to FLAC (lossless compression, smaller than WAV)
ffmpeg -i "input.wav" "output.flac"

# Batch convert all WAV files in a directory
for file in *.wav; do
  ffmpeg -i "$file" -b:a 320k "${file%.wav}.mp3"
done
```

**Using Audacity (GUI):**
1. Open the WAV file
2. File → Export → Export as MP3
3. Choose quality (320 kbps recommended)

### Option 2: Increase Supabase File Size Limit (Pro Plan)

With Supabase Pro plan, you can increase the file size limit up to **5GB per file**:

1. Go to Supabase Dashboard → **Storage** → **Settings**
2. Find **"Global file size limit"** option
3. Set your desired maximum (up to 5GB = 5120MB for standard uploads)
4. Optionally, set bucket-specific limits:
   - Go to **Storage** → **Buckets** → Select `audio-files`
   - Click **Edit bucket** → Enable **"Restrict file size"**
   - Set limit (must be ≤ global limit)
5. Update your `web/.env.local` to match:
   ```env
   MAX_FILE_SIZE_MB=5120  # 5GB for Pro plan
   ```
6. Re-run the upload script

**Note**: The script now defaults to 5GB (5120MB) for Pro plans.

### Option 3: Use Chunked Upload (Advanced)

For very large files, you could implement chunked uploads, but this requires custom code changes.

## Current Configuration

The upload script checks file size before uploading. 

**Default limits:**
- Free tier: 50MB
- Pro plan: 5GB (5120MB) - **This is now the default**

To override the limit, add to `web/.env.local`:
```env
MAX_FILE_SIZE_MB=5120  # 5GB for Pro plan
```

## Checking File Sizes

To see which files are too large:

```bash
# Find all files larger than 50MB
find web/public/audio -type f -size +50M -exec ls -lh {} \;

# Show file sizes in MB
find web/public/audio -type f -exec ls -lh {} \; | awk '{print $5, $9}'
```

## Recommended Approach

1. **For web streaming**: Use MP3 (320kbps) - good quality, small size
2. **For downloads**: Use FLAC - lossless, smaller than WAV
3. **Keep originals**: Store original WAV files locally, upload compressed versions

## Script Behavior

The updated upload script will:
- ✅ Check file size before attempting upload
- ⚠️  Skip files that are too large (with clear message)
- 📊 Report how many files were skipped due to size
- ✅ Continue uploading other files even if some are too large

