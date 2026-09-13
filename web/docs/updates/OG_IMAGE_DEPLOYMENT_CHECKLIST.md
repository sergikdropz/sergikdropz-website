# OG Image Deployment Checklist ✅

## Implementation Complete

All code changes have been made to ensure your hero page shows consistently when sharing your site.

### Files Modified:
- ✅ `web/app/og/route.tsx` - Dynamic OG image generator
- ✅ `web/app/layout.tsx` - Updated metadata with explicit OG image tags
- ✅ `web/app/page.tsx` - Instagram feed scrollable container

---

## Pre-Deployment Steps

### 1. Verify Environment Variable

Make sure `NEXT_PUBLIC_SITE_URL` is set in your production environment:

**For Vercel:**
- Go to your project settings → Environment Variables
- Add/Update: `NEXT_PUBLIC_SITE_URL` = `https://yourdomain.com`
- Make sure it's set for **Production** environment

**For other platforms:**
- Set the environment variable in your hosting platform's settings
- Value should be your full production URL (e.g., `https://sergikdropz.com`)

### 2. Test Locally (Optional)

```bash
cd web
npm run dev
```

Then visit:
- `http://localhost:3001/og` - Should show the generated OG image
- Check the page source for `<meta property="og:image">` tags

---

## Deployment Steps

### 1. Deploy to Production

Deploy your changes using your normal deployment process:

```bash
# If using Vercel CLI
vercel --prod

# Or push to your main branch if auto-deploy is enabled
git add .
git commit -m "Add OG image for consistent social sharing"
git push origin main
```

### 2. Verify OG Image Route

After deployment, test the OG image endpoint:
- Visit: `https://yourdomain.com/og`
- You should see a 1200x630px image with "SERGIK" title and bio
- If you see an error, check the deployment logs

### 3. Clear Social Media Caches

**This is critical!** Social platforms cache OG images aggressively.

#### Facebook/Meta:
1. Go to: https://developers.facebook.com/tools/debug/
2. Enter your homepage URL
3. Click "Scrape Again" to clear cache
4. Verify the preview shows your hero page image

#### Twitter/X:
1. Go to: https://cards-dev.twitter.com/validator
2. Enter your homepage URL
3. Click "Preview card" to see the updated image
4. Note: Twitter may take a few minutes to update

#### LinkedIn:
1. Go to: https://www.linkedin.com/post-inspector/
2. Enter your homepage URL
3. Click "Inspect" to see the updated preview

#### WhatsApp/iMessage:
- These platforms cache aggressively
- May take 24-48 hours to update
- Try sharing to a new chat if needed

### 4. Test Sharing

Test sharing your homepage URL:
- **Text message** - Share via SMS/iMessage
- **WhatsApp** - Share in a chat
- **Social media** - Post on Facebook, Twitter, LinkedIn
- **Email** - Send a link in an email

All should show your hero page image consistently.

---

## Troubleshooting

### OG Image Not Showing
1. **Check the route works**: Visit `https://yourdomain.com/og` directly
2. **Verify environment variable**: Make sure `NEXT_PUBLIC_SITE_URL` is set correctly
3. **Check meta tags**: View page source and look for `<meta property="og:image">`
4. **Clear browser cache**: Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Still Seeing Random Images
1. **Clear social media caches** (see step 3 above)
2. **Wait 24-48 hours** - Some platforms cache aggressively
3. **Check meta tags** - Ensure they're in the `<head>` section
4. **Verify absolute URLs** - OG image URL should be full URL, not relative

### OG Image Route Returns Error
1. Check deployment logs for errors
2. Verify `artist.json` exists and has `bio.short` field
3. Check Next.js version supports `next/og` (Next.js 13+)
4. Verify edge runtime is supported by your hosting platform

---

## What Changed

### Before:
- Social sharing showed random gallery images
- Different images each time
- No consistent branding

### After:
- ✅ Consistent hero page image on all shares
- ✅ Professional preview with SERGIK branding
- ✅ Matches your homepage design
- ✅ Works across all platforms (Facebook, Twitter, LinkedIn, WhatsApp, iMessage, etc.)

---

## Maintenance

The OG image is generated dynamically from your `artist.json` file, so:
- If you update your bio, the OG image will automatically reflect it
- No need to regenerate images manually
- The image updates on the next deployment

---

## Support

If you encounter any issues:
1. Check the deployment logs
2. Verify environment variables are set
3. Test the `/og` route directly
4. Clear social media caches
5. Wait 24-48 hours for cache propagation

---

**Status**: ✅ Ready for Deployment
