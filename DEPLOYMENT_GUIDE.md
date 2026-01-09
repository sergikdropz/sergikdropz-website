# Deployment Guide - Publishing to Vercel

## Option 1: Deploy via Vercel Website (Easiest - Recommended)

1. **Go to Vercel Website:**
   - Visit https://vercel.com
   - Sign up or log in with GitHub, GitLab, or Bitbucket

2. **Import Your Project:**
   - Click "Add New..." → "Project"
   - Import your Git repository (if you have one) OR
   - Use "Deploy" → "Upload" to upload the project folder

3. **Configure Project Settings:**
   - **Root Directory:** Set to `web` (since your Next.js app is in the `web` folder)
   - **Framework Preset:** Next.js (should auto-detect)
   - **Build Command:** `npm run build` (should auto-detect)
   - **Output Directory:** `.next` (should auto-detect)
   - **Install Command:** `npm install` (should auto-detect)

4. **Environment Variables (if needed):**
   - If you have any API keys (Spotify, YouTube, etc.), add them in the Environment Variables section

5. **Deploy:**
   - Click "Deploy"
   - Wait for the build to complete
   - Your site will be live at a URL like: `your-project.vercel.app`

6. **Custom Domain:**
   - After deployment, go to Project Settings → Domains
   - Add your custom domain: `www.sergikdropz.com`
   - Follow Vercel's DNS instructions to configure your domain

## Option 2: Deploy via Vercel CLI

### Step 1: Login to Vercel
```bash
cd "/Users/machd/Documents/SERGIK Web and app"
npx vercel login
```

If the browser doesn't open automatically:
- Copy the URL shown in the terminal
- Paste it into your browser
- Complete the authentication

### Step 2: Deploy
```bash
npx vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? (Select your account)
- Link to existing project? **No** (for first deployment)
- What's your project's name? **sergik-web** (or any name)
- In which directory is your code located? **./web**

### Step 3: Production Deploy
```bash
npx vercel --prod
```

## Option 3: Deploy via Git Integration (Best for Continuous Deployment)

1. **Push your code to GitHub/GitLab/Bitbucket**

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Click "Add New..." → "Project"
   - Import your Git repository
   - Vercel will auto-detect Next.js settings

3. **Automatic Deployments:**
   - Every push to `main` branch = production deployment
   - Every push to other branches = preview deployment

## Important Notes:

- **Root Directory:** Your `vercel.json` already specifies `rootDirectory: "web"`, so Vercel knows where your Next.js app is
- **Build:** The build command is already configured in `vercel.json`
- **Custom Domain:** After first deployment, add `www.sergikdropz.com` in project settings
- **Environment Variables:** Add any API keys in Vercel dashboard if needed

## Troubleshooting:

If deployment fails:
1. Check the build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Verify `next.config.js` doesn't have any errors
4. Check that all image domains are properly configured

