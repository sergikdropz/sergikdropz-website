# Environment Variables Reference

Create a file named `.env.local` in the `web/` directory with these variables:

```bash
# ============================================
# SUPABASE (Required for database & storage)
# ============================================
# Get these from: https://supabase.com/dashboard → Your Project → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# STRIPE (Required for payments)
# ============================================
# Get these from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ============================================
# SITE CONFIGURATION
# ============================================
# Your site URL (for production, use your actual domain)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ============================================
# ANALYTICS (Optional)
# ============================================
# Google Analytics measurement ID (enables GA in app/layout.tsx)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# ============================================
# SPOTIFY API (Optional - for discography)
# ============================================
# Get these from: https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# ============================================
# YOUTUBE API (Optional - for videos)
# ============================================
# Get these from: https://console.cloud.google.com
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=@sergikdropz

# ============================================
# INSTAGRAM API (Optional - for auto-fetching posts)
# ============================================
# Get these from: https://developers.facebook.com/apps/
# See: web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md for detailed instructions
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_USER_ID=your_instagram_user_id
# Optional: Secret for cron job security (generate a random string)
INSTAGRAM_CRON_SECRET=your_random_secret_here

# ============================================
# CRON SECURITY (Optional - for cron endpoints)
# ============================================
# Used by /api/cron/* endpoints (campaign scheduler/sender)
CRON_SECRET=your_random_secret_here

# ============================================
# FTP SERVER (Optional - for FTP scanning)
# ============================================
# Required for: scripts/ftp-scan-to-supabase.mjs
FTP_HOST=ftp.example.com
FTP_USER=username
FTP_PASSWORD=password
FTP_PORT=21
FTP_SECURE=false
FTP_ROOT_PATH=/

# ============================================
# EMAIL (Optional - for campaign sends)
# ============================================
# Resend API key (used by lib/email.ts)
RESEND_API_KEY=re_...
# Default sender email for campaigns
NEXT_PUBLIC_FROM_EMAIL=noreply@sergikdropz.com

# ============================================
# AI APIs (Optional - for Sonic DNA analysis)
# ============================================
# Get OpenAI key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Get Anthropic key from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Quick Setup

1. Copy the template above
2. Create `web/.env.local`
3. Fill in your actual values
4. Never commit this file to git (it's in `.gitignore`)

## Required vs Optional

**Required:**

- Supabase variables (for database & storage)
- Stripe variables (for payments)
- `NEXT_PUBLIC_SITE_URL` (for redirects)

**Optional:**

- Spotify API (only if using Spotify integration)
- YouTube API (only if using YouTube integration)
- Instagram API (only if auto-fetching Instagram posts - otherwise use manual post URLs)
- AI APIs (OpenAI/Anthropic for Sonic DNA analysis)
