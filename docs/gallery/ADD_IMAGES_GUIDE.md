# How to Add Images to SERGIK EPK

## Quick Method

1. **Get your images ready** - Make sure you have all 9 gallery images and 6 release artwork files

2. **Option A: Use the script**
   ```bash
   # Create an 'images' folder in project root with subfolders:
   # images/gallery/  (put gallery images here)
   # images/releases/ (put release artwork here)
   
   # Then run:
   bash add-images.sh
   ```

3. **Option B: Manual copy**
   ```bash
   # Copy gallery images
   cp your-gallery-images/*.jpg web/public/images/gallery/
   
   # Copy release artwork
   cp your-release-artwork/*.jpg web/public/images/releases/
   ```

## Required Images

### Gallery Images (9 total)
Place in: `web/public/images/gallery/`

1. **desert-portrait-1.jpg** - Desert landscape, golden hour, profile view
2. **rooftop-portrait-1.jpg** - Urban rooftop at night, city lights
3. **performance-green-1.jpg** - Live performance with green lighting, geometric stage
4. **studio-red-1.jpg** - Studio session with LED panels, red couch
5. **performance-pioneer-1.jpg** - Performance from behind, purple/orange lighting
6. **sunset-portrait-1.jpg** - Sunset portrait with palm trees
7. **performance-red-blue-1.jpg** - Intense performance, red/blue lighting
8. **performance-group-1.jpg** - Collaborative performance scene
9. **performance-closeup-1.jpg** - Close-up performance moment

### Release Artwork (6 total)
Place in: `web/public/images/releases/`

1. **soul-candy.jpg** - Soul Candy EP
2. **ftp.jpg** - FTP EP
3. **a-good-day.jpg** - A Good Day (feat. Be Janis)
4. **repeat-cozy-catz.jpg** - Repeat / Cozy Catz (feat. DiscoFlip)
5. **say-yeah-remix.jpg** - Say Yeah (Sergik Remix)
6. **funky-bounce.jpg** - Funky Bounce

## Image Requirements

- **Format:** JPG, JPEG, PNG, or WebP
- **Size:** Minimum 1000x1000px (square preferred)
- **File Size:** Under 2MB per image (optimize before adding)
- **Naming:** Must match the exact filenames listed above

## If You Don't Have Images Yet

The app will still work! It will show:
- Placeholder areas for missing images
- Text descriptions where images should be
- All other content will display normally

You can add images later and they'll automatically appear.

## Need Help?

1. Check `IMAGE_MAPPING.md` for detailed image descriptions
2. Make sure filenames match exactly (case-sensitive)
3. Images should be in JPG, PNG, or WebP format

