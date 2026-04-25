# Image File Mapping Guide

This document maps the image descriptions to the expected filenames for the SERGIK EPK app.

## Gallery Images

Place all gallery images in: `web/public/images/gallery/`

### Image Files Needed:

1. **desert-portrait-1.jpg**
   - Desert landscape at golden hour
   - Profile view, reflective sunglasses, gold chain
   - Mountains, lake, desert vegetation in background
   - Use for: Hero image on homepage, landscape gallery

2. **rooftop-portrait-1.jpg**
   - Urban rooftop at night
   - Man bun, full beard, heavily tattooed forearms
   - Edison string lights, city skyline bokeh
   - Use for: Portrait gallery, about page

3. **performance-green-1.jpg**
   - Live performance with green lighting
   - Bucket hat, Off-White jacket, orange sunglasses on chain
   - Geometric stage props, crystalline pillar, Pioneer DJ setup
   - Use for: Performance gallery, EPK

4. **studio-red-1.jpg**
   - Studio session with LED lighting
   - Fedora hat, SERGIK logo t-shirt, red couch
   - Geometric LED panels, audio equipment, dog companion
   - Use for: Studio gallery, about page

5. **performance-pioneer-1.jpg**
   - Performance from behind
   - Off-White jacket with four-arrow logo, bucket hat
   - Purple and orange/yellow lighting, atmospheric haze
   - Use for: Performance gallery

6. **sunset-portrait-1.jpg**
   - Sunset portrait
   - Dark wavy hair, full beard, dark sunglasses
   - Hands clasped, heavy forearm tattoos
   - Palm tree silhouette, vibrant sunset sky
   - Use for: Portrait gallery, EPK

7. **performance-red-blue-1.jpg**
   - Intense performance with red/blue lighting
   - Profile view, bucket hat, Off-White jacket
   - Pioneer DJ mixer, Supreme logo visible
   - Use for: Performance gallery, homepage

8. **performance-group-1.jpg**
   - Collaborative performance scene
   - Three performers, SERGIK with Pioneer setup
   - Red/blue lighting, abstract graphic banner
   - Use for: Performance gallery, EPK

9. **performance-closeup-1.jpg**
   - Intimate close-up performance
   - Full beard, over-ear headphones, dark cap
   - Angular chevron pattern on jacket sleeve
   - Red-orange and blue lighting
   - Use for: Performance gallery

## Release Artwork

Place all release artwork in: `web/public/images/releases/`

### Release Artwork Needed:

1. **soul-candy.jpg** - Soul Candy EP (2025)
2. **ftp.jpg** - FTP EP (2024)
3. **a-good-day.jpg** - A Good Day (feat. Be Janis) Single (2025)
4. **repeat-cozy-catz.jpg** - Repeat / Cozy Catz (feat. DiscoFlip) Single (2025)
5. **say-yeah-remix.jpg** - Say Yeah (Sergik Remix) (2025)
6. **funky-bounce.jpg** - Funky Bounce Single (2024)

## Image Specifications

### Recommended Settings:
- **Format:** JPG or WebP
- **Gallery Images:** 
  - Minimum: 1200x1200px
  - Aspect Ratio: 1:1 (square) preferred
  - Max File Size: 2MB per image
- **Release Artwork:**
  - Minimum: 1000x1000px
  - Aspect Ratio: 1:1 (square)
  - Max File Size: 1MB per image

### Optimization:
- Use image compression tools before uploading
- Consider WebP format for better compression
- Next.js will automatically optimize images

## Quick Setup

1. Copy your images to the appropriate folders:
   ```bash
   # Gallery images
   cp your-images/*.jpg web/public/images/gallery/
   
   # Release artwork
   cp your-artwork/*.jpg web/public/images/releases/
   ```

2. Rename files to match the expected filenames listed above

3. The app will automatically load and display them!

## Notes

- If you don't have all images yet, the app will show placeholder areas
- You can update image paths in `web/data/gallery.json` and `web/data/releases.json` if needed
- For mobile app, update URLs in `mobile/src/data/gallery.json` to point to your hosted images or use local assets

