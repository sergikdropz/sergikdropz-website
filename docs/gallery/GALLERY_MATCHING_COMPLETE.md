# Gallery Image Matching - Complete Setup

## ✅ What's Been Done

1. **Rescanned gallery directory** - Found 23 unorganized images
2. **Created matching tools** - Scripts to help identify and rename images
3. **Created documentation** - Guides and templates for matching

## 📊 Current Status

- **Working images**: 9 (displaying correctly)
- **Missing expected**: 21 (in gallery.json, files don't exist)
- **Unorganized**: 23 (files exist, not in gallery.json)
- **Potential matches**: 23 unorganized could match 21 missing (2 extra)

## 🛠️ Tools Created

### 1. `scripts/images/match-gallery-images.sh`
Lists all unorganized images and missing expected images with details.

### 2. `scripts/images/rename-gallery-images.sh`
Renames images based on a mapping file.

### 3. `scripts/images/auto-review-images.sh`
Interactive tool to review images and create mappings.

### 4. `image-mappings.txt`
Mapping file used by the rename script.

### 5. `IMAGE_MATCHING_GUIDE.md`
Complete guide with all descriptions.

## 📝 How to Match and Rename Images

### Step 1: Review Images Visually

```bash
# Open gallery directory in Finder
open web/public/images/gallery

# Or use the review script
./scripts/images/auto-review-images.sh
# Choose option 2 to open in Finder
```

### Step 2: Create Mapping File

1. Edit `image-mappings.txt` with your matches:
   ```
   IMG_2011.jpg|club-neon-all-you-1.jpg|Club scene with neon
   IMG_2014.jpg|dj-booth-lasers-1.jpg|DJ booth with lasers
   IMG_2018.jpg|performance-green-haze-1.jpg|Green lighting
   ...
   ```

3. Format: `OLD_NAME|NEW_NAME|Description`

### Step 3: Rename Images

```bash
./scripts/images/rename-gallery-images.sh
```

This will rename all images listed in `image-mappings.txt`.

### Step 4: Verify

```bash
./scripts/images/rescan-detailed.sh
```

Check that renamed images now show as ✅ in the gallery.

## 📋 Quick Reference

### Unorganized Images (23)
- `1.JPG`, `2.JPG` (large, Nov 2024)
- `IMG_0203.PNG` (large, 3.33MB)
- `IMG_1519.jpeg` (2.75MB)
- `IMG_2192.jpeg` (1.52MB)
- `IMG_5612.jpg`, `IMG_5629.jpg` (medium, 0.3-0.4MB)
- `IMG_2011.jpg` through `IMG_5826.jpeg` (small, 0.1-0.3MB)

### Missing Expected Images (21)

**Performance (12):**
- club-neon-all-you-1.jpg
- dj-booth-lasers-1.jpg
- dj-blue-mixer-1.jpg
- dj-gold-glasses-1.jpg
- dj-mixing-blue-1.jpg
- performance-blue-hands-1.jpg
- performance-eye-led-1.jpg
- performance-green-haze-1.jpg
- performance-hand-pattern-1.jpg
- performance-sergik-back-1.jpg
- performance-sergik-tent-1.jpg
- performance-two-djs-1.jpg

**Portrait (8):**
- portrait-festival-two-1.jpg
- portrait-graffiti-crouch-1.jpg
- portrait-graffiti-wall-1.jpg
- portrait-group-three-1.jpg
- portrait-offwhite-supreme-1.jpg
- portrait-smoking-graffiti-1.jpg
- portrait-supreme-nike-1.jpg
- portrait-vault-green-1.jpg

**Landscape (1):**
- desert-elated-1.jpg

## 💡 Tips for Matching

1. **File sizes**:
   - Large (2-5MB): Portraits, landscapes, group photos
   - Medium (0.3-1.5MB): Performance shots, stage photos
   - Small (0.1-0.3MB): Close-ups, detail shots, hands on mixer

2. **Dates**:
   - Most images from same session (2026-01-10 10:05)
   - Two large files from different session (2024-11-03)

3. **Look for**:
   - Specific clothing/brands mentioned in descriptions
   - Number of people (solo, two, three)
   - Settings (club, desert, graffiti wall)
   - Lighting colors (green, blue, red, purple)

## ⚠️ Important Notes

- **Review visually** before renaming - don't rely on file names alone
- **Backup first** if you're unsure (or the script will skip if target exists)
- **Not all images may match** - that's okay, keep unorganized ones
- **Some expected images may not have matches yet** - that's fine too

## 🎯 Next Steps

1. ✅ Review images visually (use Finder or review script)
2. ✅ Create `image-mappings.txt` with your matches
3. ✅ Run `./scripts/images/rename-gallery-images.sh` to rename
4. ✅ Run `./scripts/images/rescan-detailed.sh` to verify
5. ✅ Check gallery page - new images should appear automatically!

## 📄 Files Reference

- `IMAGE_MATCHING_GUIDE.md` - Complete descriptions
- `image-mappings.txt` - Mapping file for renames
- `GALLERY_RESCAN_REPORT.md` - Detailed rescan results
- `scripts/images/match-gallery-images.sh` - List unorganized and missing
- `scripts/images/rename-gallery-images.sh` - Rename based on mappings
- `scripts/images/auto-review-images.sh` - Interactive review tool

---

**Status**: ✅ Tools ready - Review images and create mappings to complete the matching process!
