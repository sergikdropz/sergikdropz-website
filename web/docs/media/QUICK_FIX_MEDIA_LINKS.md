# 🚀 Quick Fix: Media Links

## The Problem
All media is broken - audio files, images, waveforms, Sonic DNA - everything returns 404.

## The Solution (2 Minutes)

### Step 1: Run the Master Script

```bash
cd web
node scripts/fix-all-media-links.mjs
```

This will:
- ✅ Scan Supabase Storage
- ✅ Scan Supabase Database  
- ✅ Match everything with music-library.json
- ✅ Fix all broken links
- ✅ Create missing records
- ✅ Update file paths and URLs

### Step 2: Verify It Worked

```bash
# Check Supabase
node scripts/verify-supabase-files.mjs
```

### Step 3: Test in Browser

1. Visit: `https://sergikdropz.com/music-library`
2. Try playing a track
3. Check if images load
4. Verify waveforms appear

## If You Want to See What Will Change First

Run with `--dry-run` to preview:

```bash
node scripts/fix-all-media-links.mjs --dry-run
```

## What Gets Fixed

- ✅ **Audio Files** - All file_path and file_url corrected
- ✅ **Database Records** - Missing records created, paths updated
- ✅ **Metadata** - Title, artist, duration, BPM synced from library
- ✅ **Image Paths** - Large images marked (will need optimization or Supabase upload)

## Troubleshooting

**"Missing environment variables"**
- Make sure `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

**"Files still don't work"**
- Check Supabase Storage bucket permissions
- Verify environment variables in Vercel
- Check browser console for actual errors

## Full Documentation

See `MEDIA_RELINKING_GUIDE.md` for detailed information.
