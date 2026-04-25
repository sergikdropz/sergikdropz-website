# Supabase Pro Plan - File Size Limit Setup

Since you have a Supabase Pro plan, you can upload much larger files (up to 5GB per file).

## ✅ Current Status

**Bucket Limit**: ✅ Already set to **5GB (5120MB)** for `audio-files` bucket

**Global Limit**: ⚠️ **You need to set this in the dashboard** (see below)

## Quick Setup Steps

### 1. Configure Global File Size Limit (REQUIRED)

The bucket limit is already set to 5GB, but you must also set the **global limit** in the dashboard:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Storage** → **Settings**
4. Find **"Global file size limit"**
5. Set it to **5120 MB (5GB)** or higher (up to 500GB on Pro plan)
6. Click **Save**

**Important**: The bucket limit (5GB) cannot exceed the global limit, so make sure the global limit is at least 5GB.

### 3. Update Environment Variable (Optional)

The script now defaults to 5GB, but you can explicitly set it in `web/.env.local`:

```env
MAX_FILE_SIZE_MB=5120
```

### 4. Re-run Upload Script

```bash
cd web
node scripts/upload-audio-to-supabase.mjs
```

## Pro Plan Limits

- **Standard Uploads**: Up to 5GB per file
- **Resumable/S3 Uploads**: Up to 50GB per file
- **Global Limit**: Up to 500GB (configured in dashboard)

For audio files, 5GB should be more than sufficient for even the largest WAV files.

## Verify Your Settings

After configuring, the upload script will show:
```
📏 Max file size: 5120MB
```

If you see a different limit, check:
1. Your `.env.local` file for `MAX_FILE_SIZE_MB`
2. Your Supabase dashboard Storage settings

