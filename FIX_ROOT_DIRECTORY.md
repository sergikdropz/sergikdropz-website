# 🔧 Fix Vercel Root Directory - REQUIRED

Your website is showing 404 errors because the Vercel project's **Root Directory** is not set correctly.

## ⚠️ The Problem

The build completes successfully, but Vercel can't find the built files because the root directory setting points to the wrong location.

## ✅ The Solution (2 minutes)

**You MUST update this in the Vercel Dashboard - it cannot be done via CLI:**

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Login if needed

2. **Open Your Project:**
   - Click on **"sergikdropz-website"** project

3. **Update Root Directory:**
   - Click **Settings** (top menu)
   - Click **General** (left sidebar)
   - Scroll down to **"Root Directory"**
   - **Change it to:** `web`
   - Click **Save**

4. **Automatic Redeploy:**
   - Vercel will automatically trigger a new deployment
   - Wait 1-2 minutes for it to complete
   - Your site will be live at https://sergikdropz.com

## 🎯 Why This Is Needed

- Your Next.js app is in the `web/` folder
- Vercel needs to know this is the root directory
- Without this setting, Vercel looks in the wrong place and finds nothing
- This setting can ONLY be changed in the dashboard (not via CLI)

## ✅ After Fixing

Once you update the root directory:
- The site will automatically redeploy
- All routes will work correctly
- https://sergikdropz.com will be fully functional

---

**This is the ONLY thing preventing your site from working. It takes 2 minutes to fix in the dashboard.**

