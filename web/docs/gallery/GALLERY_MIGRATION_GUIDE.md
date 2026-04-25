# 📸 Gallery Migration to Supabase

## Quick Start

Migrate your existing `gallery.json` images to Supabase database:

```bash
cd web
node scripts/migrate-gallery-to-supabase.mjs
```

## Prerequisites

1. **Database table created**: Run `web/supabase/gallery_images_schema.sql` in Supabase SQL Editor first
2. **Environment variables set**: Make sure `.env.local` has:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

## What It Does

1. Reads all images from `web/data/gallery.json`
2. Checks if each image already exists in database (by `image_id`)
3. Creates database entries for new images
4. Preserves all metadata (alt, category, description)
5. Skips duplicates automatically

## Output Example

```
🚀 Starting gallery migration to Supabase...

📸 Found 237 images in gallery.json

✅ Migrated desert-portrait-1
✅ Migrated rooftop-portrait-1
⏭️  Skipping performance-green-1 (already exists)
✅ Migrated studio-red-1
...

📊 Migration Summary:
   ✅ Success: 235
   ⏭️  Skipped: 2
   ❌ Errors: 0
   📸 Total: 237

🎉 Migration completed successfully!
```

## Troubleshooting

### "Missing Supabase environment variables"
- Check that `.env.local` exists in `web/` directory
- Verify variables are set correctly
- Restart terminal/IDE after adding variables

### "relation 'gallery_images' does not exist"
- Run the SQL schema first: `web/supabase/gallery_images_schema.sql`
- Check table exists: `SELECT * FROM gallery_images LIMIT 1;` in Supabase SQL Editor

### "duplicate key value violates unique constraint"
- This means image already exists - script will skip it automatically
- This is normal if you run the script multiple times

### Connection errors
- Verify Supabase URL is correct
- Check service role key is valid
- Ensure Supabase project is active

## After Migration

1. **Verify in Supabase**: 
   ```sql
   SELECT COUNT(*) FROM gallery_images;
   ```

2. **Test frontend**: Visit `/gallery` - images should load from database

3. **Test admin**: Visit `/admin/gallery` - you should see all images

## Re-running

The script is **idempotent** - safe to run multiple times:
- Skips existing images
- Only creates new entries
- Won't duplicate data

## Manual Migration

If you prefer to migrate manually:

1. Open Supabase SQL Editor
2. For each image in `gallery.json`, run:
   ```sql
   INSERT INTO gallery_images (image_id, filename, src, alt, category, description, is_active)
   VALUES ('image-id', 'filename.jpg', '/images/gallery/filename.jpg', 'Alt text', 'portrait', 'Description', true);
   ```
