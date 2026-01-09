# Domain Update Guide

Your website domain is now configurable and won't break when you change it. Here's how to update it:

## Quick Update (Recommended)

### Option 1: Environment Variable (Best for Production)

1. **Set the environment variable in Vercel:**
   - Go to your Vercel project dashboard
   - Navigate to **Settings** → **Environment Variables**
   - Add a new variable:
     - **Name:** `NEXT_PUBLIC_SITE_URL`
     - **Value:** `https://your-new-domain.com` (your new domain)
   - Select **Production**, **Preview**, and **Development** environments
   - Click **Save**
   - Redeploy your site

2. **For local development:**
   - Create a `.env.local` file in the `web/` directory
   - Add: `NEXT_PUBLIC_SITE_URL=https://your-new-domain.com`

### Option 2: Automatic Detection (No Configuration Needed)

If you don't set the environment variable, the website will automatically detect the domain from the request headers. This means:
- It will work on any domain you deploy it to
- No configuration needed for different environments
- Works automatically on preview deployments

## What Was Changed

1. **EPK Download Route** (`web/app/api/epk-download/route.ts`)
   - Now uses `NEXT_PUBLIC_SITE_URL` environment variable
   - Falls back to detecting domain from request headers
   - Final fallback to `sergikdropz.com` if needed

2. **Robots.txt** (`web/app/robots.txt/route.ts`)
   - Changed from static file to dynamic route
   - Now uses `NEXT_PUBLIC_SITE_URL` for the sitemap URL
   - Automatically updates when domain changes

## Testing

After updating:
1. Check that `/robots.txt` shows the correct sitemap URL
2. Download the EPK from `/epk` and verify URLs are correct
3. Verify all internal links work correctly

## Important Notes

- The old static `robots.txt` file has been removed (it's now dynamic)
- The domain will automatically work on any domain you deploy to
- You can use different domains for different environments (dev, staging, production)
- No code changes needed when switching domains

