# Image Optimization Required

## Issue
The EP artwork images in `public/images/audio/unreleased/eps/` are too large (110MB total) and exceed Vercel's 100MB deployment limit. These images are currently excluded from deployment, causing 404 errors.

## Affected Images
- `SERGIK - Are We Awake/64804719-FCBB-4F62-B570-DC695D1DC699.PNG` (15MB)
- `SERGIK - Daze/89D09194-956E-422F-A040-8A9DEC10C3DD.PNG` (18MB)
- `SERGIK - In The Streets/1FF2EF20-92A7-4FF6-8850-6FA3987CAC74.png` (14MB)
- `SERGIK - Inspire/720426BD-0BE7-4582-A072-2E014DB9E2BC.PNG` (5.2MB)
- `SERGIK - Utopia/IMG_2622.jpeg` (3.8MB)
- `SERGIK - Soul Candy/57A67CAB-0A23-4AB6-AE83-C840B0E0D3E4.jpeg` (3.5MB)
- And several others...

## Solutions

### Option 1: Optimize Images (Recommended)
1. Use image optimization tools to compress images:
   ```bash
   # Install sharp-cli or use online tools
   npm install -g sharp-cli
   # Compress PNG files
   sharp -i input.PNG -o output.jpg -q 85 --resize 2000
   ```

2. Target sizes:
   - Web display: 800-1200px width, JPEG quality 85
   - Thumbnails: 300-400px width
   - File size: <500KB per image

### Option 2: Host on Supabase Storage
1. Upload images to Supabase Storage bucket
2. Update image paths in `music-library.json` to use Supabase URLs
3. Images will be served from CDN, not Vercel

### Option 3: Use Next.js Image Optimization
- Keep images in repo but ensure they're optimized
- Next.js will automatically optimize on first request
- But still need to stay under 100MB deployment limit

## Current Status
- Images are excluded from Vercel deployment (`.vercelignore`)
- Site will show 404 errors for these images until fixed
- Smaller images (<2MB) are still deployed and working

## Next Steps
1. **Immediate**: Optimize the large PNG/JPEG files to <500KB each
2. **Alternative**: Upload to Supabase Storage and update paths
3. **Long-term**: Set up automated image optimization pipeline
