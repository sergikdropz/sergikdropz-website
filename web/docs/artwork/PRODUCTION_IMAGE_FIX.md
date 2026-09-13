# Production Image 404 Fix

## Issue

Production site is trying to load EP artwork images from Vercel domain instead of Supabase:
```
GET https://sergikdropz.com/images/audio/unreleased/eps/... 404 (Not Found)
```

## Root Cause

The production build is using an old version of `music-library.json` that may have local paths, OR the components weren't using `resolveImageUrl()` to convert local paths to Supabase URLs in production.

## Fix Applied

### 1. Updated Components ✅
All artwork images in `web/app/music-library/page.tsx` now use `resolveImageUrl()`:
- Track artwork in track list
- Current track artwork in player
- Folder/EP artwork in folder view
- Expanded artwork modal

**Before:**
```tsx
<Image src={track.artwork} ... />
```

**After:**
```tsx
<Image src={resolveImageUrl(track.artwork)} ... />
```

### 2. How `resolveImageUrl()` Works

- **If artwork is already a Supabase URL** (starts with `http://` or `https://`): Returns as-is
- **If artwork is a local path** (e.g., `/images/audio/unreleased/eps/...`): 
  - In **production**: Converts to Supabase Storage URL
  - In **development**: Returns local path for fallback

### 3. Production Behavior

When production builds with the updated code:
- Images with Supabase URLs → Load directly from Supabase ✅
- Images with local paths → Automatically converted to Supabase URLs ✅
- All images will load from Supabase Storage ✅

## Next Steps

1. **Redeploy to Production**: The updated code needs to be deployed
2. **Verify**: After deployment, check browser console - images should load from `*.supabase.co` domains
3. **If still 404**: Check that:
   - `NEXT_PUBLIC_SUPABASE_URL` is set in Vercel environment variables
   - EP artwork images are uploaded to Supabase Storage (`gallery-images` bucket)
   - `music-library.json` has Supabase URLs (or local paths will be auto-converted)

## Verification

After deployment, check:
- Browser Network tab: Image requests should go to `*.supabase.co`
- No 404 errors for EP artwork images
- All artwork displays correctly

## Files Changed

- `web/app/music-library/page.tsx` - All artwork images now use `resolveImageUrl()`
- `web/utils/resolveImageUrl.ts` - Already configured for production Supabase URLs
