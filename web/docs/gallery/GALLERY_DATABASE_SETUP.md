# 🗄️ Gallery Database Setup - End-to-End

## Overview

The gallery system is now **fully wired end-to-end with Supabase database** as the source of truth. All operations (view, upload, edit, delete) flow through the database.

## Architecture Flow

```
Frontend (/gallery)
    ↓ fetches
API (/api/gallery/db)
    ↓ queries/updates
Supabase Database (gallery_images table)
    ↑ manages
Admin Panel (/admin/gallery)
```

## Quick Setup (3 Steps)

### Step 1: Create Database Table

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **"SQL Editor"** → **"New query"**
4. Copy and paste the contents of `web/supabase/gallery_images_schema.sql`
5. Click **"Run"**

### Step 2: Migrate Existing Data (Optional)

If you have existing images in `gallery.json`:

```bash
cd web
node scripts/migrate-gallery-to-supabase.mjs
```

This will:
- Read all images from `gallery.json`
- Create database entries for each
- Skip duplicates
- Preserve all metadata

### Step 3: Verify

Visit `/gallery` - images should load from database.  
Visit `/admin/gallery` - you can upload, edit, and delete images.

## How It Works

### Frontend Gallery (`/gallery`)
- Fetches from `/api/gallery/db?active_only=true`
- Shows only active images
- Falls back to `gallery.json` if database is empty
- Client-side rendering for dynamic updates

### Admin Gallery (`/admin/gallery`)
- Fetches from `/api/gallery/db` (all images, including inactive)
- **Upload**: Uploads to Supabase Storage → Creates database entry
- **Edit**: Updates metadata in database (alt, category, description)
- **Delete**: Removes from database (hard delete)

### API Routes (`/api/gallery/db`)
- **GET**: Fetch images with optional filtering
- **POST**: Create new image entry
- **PUT**: Update image metadata
- **DELETE**: Soft or hard delete images

## Database Schema

The `gallery_images` table stores:
- **Identification**: `image_id` (unique), `filename`
- **Metadata**: `alt`, `category`, `description`
- **Storage**: `src`, `storage_url`, `is_stored_in_supabase`
- **Control**: `display_order`, `is_active`
- **Timestamps**: `created_at`, `updated_at`

## Features

✅ **Single Source of Truth**: All data in Supabase database  
✅ **End-to-End Flow**: Frontend ↔ API ↔ Database ↔ Admin  
✅ **Automatic Sync**: Upload creates database entry automatically  
✅ **Metadata Management**: Edit alt, category, description  
✅ **Soft Deletes**: Hide images without permanent deletion  
✅ **Fallback Support**: Falls back to gallery.json if database unavailable  

## Troubleshooting

### Images not showing
1. Check database table exists: `SELECT COUNT(*) FROM gallery_images;`
2. Check API: Visit `/api/gallery/db` in browser
3. Check browser console for errors

### Upload not working
1. Verify Supabase Storage bucket `gallery-images` exists
2. Check environment variables are set
3. Check API logs for errors

### Migration errors
1. Ensure table schema is created first
2. Check `gallery.json` is valid JSON
3. Verify Supabase connection

## Next Steps

- [ ] Add image optimization on upload
- [ ] Add bulk operations
- [ ] Add drag & drop reordering
- [ ] Add search functionality
- [ ] Add pagination
