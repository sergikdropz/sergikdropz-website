# 🚀 Deploy to Production

## Quick Deploy

Your project is ready to deploy! Here are the options:

### Option 1: Git-Based Deployment (Recommended)

If your code is in Git, push to trigger automatic deployment:

```bash
git add .
git commit -m "Fix media links and sync to Supabase"
git push
```

Vercel will automatically deploy when you push to your main branch.

### Option 2: Vercel CLI Deploy

Deploy directly from command line:

```bash
cd "/Users/machd/Documents/SERGIK Web and app"
npx vercel --prod
```

**Note:** If you get file size errors, the `.vercelignore` file has been updated to exclude large files.

### Option 3: Vercel Dashboard

1. Go to: https://vercel.com/dashboard
2. Find your project: **sergikdropz-website**
3. Click **Deployments** → **Redeploy** (or it will auto-deploy on Git push)

## Important: Root Directory Setting

Make sure your Vercel project root directory is set correctly:

1. Go to: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings
2. Check **Root Directory** setting:
   - Should be: `web` (if deploying from root)
   - OR: `.` (if project root is the web folder)

## What's Being Deployed

✅ All code changes (media relinking fixes)  
✅ Service worker improvements  
✅ Enhanced audio resolution  
✅ Excluded: Large audio files (in Supabase)  
✅ Excluded: Large EP artwork images  

## After Deployment

1. **Test audio playback**: Visit `/music-library` and play tracks
2. **Check console**: Should see fewer errors
3. **Verify Supabase**: All files should load from Supabase Storage

## Troubleshooting

**File size errors:**
- Large files are excluded via `.vercelignore`
- Audio files are served from Supabase, not Vercel

**404 errors:**
- Check root directory setting in Vercel dashboard
- Verify environment variables are set

**Build errors:**
- Check Vercel build logs
- Ensure all dependencies are in `package.json`
