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
# SPOTIFY API (Optional - discography + Release Studio DSP connect)
# ============================================
# Get these from: https://developer.spotify.com/dashboard
# Used by /api/spotify-discography and Release Studio Delivery → Connect stores (ISRC/UPC lookup).
# Apple Music + Deezer resolve without extra keys.
# song.link / Odesli fan-out runs by default (rate-limited). Optional private key raises limits.
# Disable with DSP_ODESLI=0. Optional: ODESLI_API_KEY / SONG_LINK_API_KEY from developers@song.link.
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
# ODESLI_API_KEY=
# DSP_ODESLI=0
# DSP_USER_COUNTRY=US
# DSP_MUSICBRAINZ=0

# ============================================
# REVELATOR AGGREGATOR (Optional - DSP delivery)
# ============================================
# Release Studio Delivery → Distribute to stores.
# Without live keys, Release Studio sends scheduled releases through DistroKid (no API — upload packet + status).
# Aggregator mode dry-runs until REVELATOR_DRY_RUN=0 and both keys are set.
# Request partner/sandbox: support@revelator.com — then set keys and REVELATOR_DRY_RUN=0.
# Docs: https://api-docs.revelator.com/v2/en/getting-started/
# REVELATOR_API_KEY=
# REVELATOR_PARTNER_USER_ID=
# REVELATOR_API_SECRET=          # legacy alias for PARTNER_USER_ID
# REVELATOR_BASE_URL=https://api.revelator.com
# REVELATOR_PLATFORM_URL=https://platform.revelator.com
# REVELATOR_ENTERPRISE_ID=
# REVELATOR_DRY_RUN=1            # force dry-run even when keys are set
# REVELATOR_REQUIRE_LIVE=0       # set 1 to refuse dry-run (API returns 500 without keys)

# ============================================
# YOUTUBE API (Optional - for videos)
# ============================================
# Get these from: https://console.cloud.google.com
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=@sergikdropz
# Subscribe gate on public release videos. OAuth client (Web) with redirect
# {origin}/api/youtube/subscribe-gate/callback and the YouTube Data API enabled.
# Scope requested at sign-in: https://www.googleapis.com/auth/youtube.force-ssl
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
# Optional. Falls back to FAN_VAULT_UNLOCK_SECRET, then a dev-only value.
YT_SUB_GATE_SECRET=

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
# Default sender email for campaigns / fan mail
NEXT_PUBLIC_FROM_EMAIL=noreply@sergikdropz.com
# Resend webhook signing secret (Svix) for /api/webhooks/resend — opens/bounces on Release Collab
# RESEND_WEBHOOK_SECRET=whsec_...
# Release Collab outbound From is hardcoded to release.studio@sergikdropz.com (verify in Resend)

# ============================================
# AI — Admin assistant + Sonic DNA review/challenge (Optional)
# Anthropic (recommended): https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=
# Optional model override (default: claude-sonnet-4-6)
# ANTHROPIC_CHAT_MODEL=claude-sonnet-4-6
# Force one provider: anthropic | openai | ollama | crowelogic
ADMIN_AI_CHAT_PROVIDER=anthropic
# Local Ollama fallback (default http://127.0.0.1:11434). Use a fast model for reviews.
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=sergikai:latest
# ADMIN_AI_OLLAMA_TIMEOUT_MS=120000

# OpenAI alternative
# OPENAI_API_KEY=
# OPENAI_CHAT_MODEL=gpt-4o-mini

# Crowe Logic / CroweLM (OpenAI-compatible — local bridge or hosted gateway)
# CROWELOGIC_BASE_URL=http://127.0.0.1:8011
# CROWELOGIC_API_KEY=your-key
# CROWELOGIC_MODEL=auto
# Aliases: CROWE_API_KEY, CROWE_LOGIC_URL, CROWE_LOGIC_KEY, FOUNDRY_BASE_URL

# ============================================
# ISRC (Optional — Studio assign defaults to QTA53)
# ============================================
# US ISRC Agency Rights Owner prefix allocated 2026-09-17 to Jordan Caboga.
# ISRC_PREFIX=QTA53

# SoundExchange / US ISRC (optional — Pipeline → ISRCs works in local registry mode without these)
# SOUNDEXCHANGE_API_KEY=
# SOUNDEXCHANGE_ACCOUNT_ID=
# SOUNDEXCHANGE_BASE_URL=https://api.soundexchange.com
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

- `NEXT_PUBLIC_PLAYBACK_TIMING=1` — dev-only console marks (`loadstart` → `canplay` → `playing`) for latency tuning
- `NEXT_PUBLIC_R2_BROWSER_PLAY=1` — **staging only**: allow presigned/CDN URLs in `<audio>` (default off; production stays on `/api/audio/media/`)
- Spotify API (only if using Spotify integration)
- YouTube API (only if using YouTube integration)
- Instagram API (only if auto-fetching Instagram posts - otherwise use manual post URLs)
- AI APIs (OpenAI/Anthropic for Sonic DNA analysis)
