# 🔄 Gallery Restoration Guide

## Quick Restore

Restore all gallery images from `gallery.json` to Supabase database:

```bash
cd web
node scripts/restore-gallery-images.mjs
```

## What It Does

1. **Reads** all images from `web/data/gallery.json`
2. **Creates** missing images in database
3. **Reactivates** soft-deleted images (sets `is_active = true`)
4. **Updates** metadata if changed (alt, category, description, src)
5. **Skips** images that are already up to date

## Use Cases

- ✅ Restore images that were soft-deleted
- ✅ Re-sync gallery.json with database
- ✅ Update metadata for existing images
- ✅ Recover from accidental deletions

## Output Example

```
🔄 Starting gallery restoration...

📸 Found 237 images in gallery.json

✅ Created desert-portrait-1
♻️  Reactivating rooftop-portrait-1
✏️  Updating performance-green-1
✓ studio-red-1 (already up to date)
...

📊 Restoration Summary:
   ✅ Created: 5
   ♻️  Reactivated: 12
   ✏️  Updated: 3
   ✓ Skipped (up to date): 217
   ❌ Errors: 0
   📸 Total: 237

🎉 Gallery restoration completed successfully!

📈 Active images in database: 237
📊 Total active images in database: 237
```

## Prerequisites

1. **Database table exists**: Run `web/supabase/gallery_images_schema.sql` first
2. **Environment variables set**: `.env.local` must have:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

## What Gets Restored

- ✅ Image metadata (alt, category, description)
- ✅ Image source path (src)
- ✅ Active status (sets `is_active = true`)
- ✅ All images from gallery.json

## Safety

- **Idempotent**: Safe to run multiple times
- **Non-destructive**: Only updates/creates, doesn't delete
- **Selective**: Only updates what changed
- **Reactivates**: Restores soft-deleted images

## Troubleshooting

### "Missing Supabase environment variables"
- Check `.env.local` exists in `web/` directory
- Verify variables are set correctly

### "relation 'gallery_images' does not exist"
- Run the SQL schema first: `web/supabase/gallery_images_schema.sql`

### Connection errors
- Verify Supabase URL is correct
- Check service role key is valid

## After Restoration

1. **Verify**: Visit `/gallery` - all images should be visible
2. **Check admin**: Visit `/admin/gallery` - all images should be active
3. **Database check**: 
   ```sql
   SELECT COUNT(*) FROM gallery_images WHERE is_active = true;
   ```
