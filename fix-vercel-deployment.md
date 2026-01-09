# Fix Vercel Root Directory

The Vercel project needs to have its root directory set to `web`. This can only be done via the Vercel Dashboard.

## Quick Fix (Dashboard)

1. Go to https://vercel.com/dashboard
2. Click on the **sergikdropz-website** project
3. Go to **Settings** → **General**
4. Scroll to **Root Directory**
5. Set it to: `web`
6. Click **Save**
7. Vercel will automatically redeploy

## Alternative: Use API Script

If you have a Vercel API token:

1. Get your token from: https://vercel.com/account/tokens
2. Run:
   ```bash
   export VERCEL_TOKEN=your_token_here
   node update-vercel-root.js
   ```

