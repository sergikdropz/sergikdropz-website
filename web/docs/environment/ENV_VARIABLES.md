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
# PRINTFUL (SERGWEAR merch fulfillment)
# ============================================
# Catalog browse/sync uses Printful's public GET /products (no key required).
# Put it out, mockups, and order submission require both values from:
# https://www.printful.com/dashboard/settings → API
# Setup guide: web/docs/admin/PRINTFUL_API_SETUP.md (Manual orders / API store)
PRINTFUL_API_KEY=
PRINTFUL_STORE_ID=
# PRINTFUL_WEBHOOK_SECRET=whsec_...  # optional: /api/printful/webhook
# Refresh catalog cache: cd web && npm run merch:sync-printful-catalog

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
# Scope requested at sign-in: https://www.googleapis.com/auth/youtube
# Full checklist: web/docs/youtube/YOUTUBE_SUBSCRIBE_GATE_SETUP.md
# Smoke: npm run smoke:youtube-subscribe-gate
# Vercel push (after .env.local filled): npm run setup:youtube-subscribe-gate-vercel
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
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
# Release promo publishing (Studio → Social promo → Connect Meta)
# Redirect URI on the Meta app: https://sergikdropz.com/api/studio/meta/callback
# Scopes: pages_show_list, pages_read_engagement, pages_manage_posts,
# instagram_basic, instagram_content_publish, business_management
# Cron: POST /api/cron/meta-promo  Authorization: Bearer $CRON_SECRET

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
# Department mail (studio, drops, fans, promo, bookings, press, shop, licensing, support).
# Domain must be verified in Resend. Defaults to sergikdropz.com.
# licensing@sergikdropz.com sends sync-license inquiry and quote mail.
# Admin copies of new licensing inquiries. Defaults to the owner reminder inbox when unset.
LICENSING_NOTIFY_EMAIL=sergikdrops@gmail.com
# Leave unset until a lawyer approves the sync draft. true unlocks attorney review and activation.
# LICENSING_ATTORNEY_REVIEW_ENABLED=true
# SERGIK_MAIL_DOMAIN=sergikdropz.com
# Resend webhook signing secret (Svix) for /api/webhooks/resend — opens/bounces on Release Collab
# and inbound replies to department mailboxes. Enable Receiving on sergikdropz.com in Resend
# and point the webhook at /api/webhooks/resend. The send-only API key cannot toggle receiving.
# RESEND_WEBHOOK_SECRET=whsec_...
# Scheduled department mail: GET/POST /api/cron/department-mail every 15 minutes
# Authorization: Bearer $CRON_SECRET
# Release Collab outbound From is hardcoded to release.studio@sergikdropz.com (verify in Resend)

# DocuSign (optional — Rights contract e-signature)
# Apps and keys: https://apps-d.docusign.com (demo) or https://apps.docusign.com (production)
# Grant JWT consent once, then Studio can send the contract PDF as an envelope.
# Webhook (JSON SIM): {SITE}/api/webhooks/docusign
# DOCUSIGN_INTEGRATION_KEY=
# DOCUSIGN_USER_ID=
# DOCUSIGN_ACCOUNT_ID=
# DOCUSIGN_RSA_PRIVATE_KEY=   # PEM; use \n for line breaks in Vercel
# DOCUSIGN_SERGIK_EMAIL=      # include SERGIK as a signer. Leave unset to send collaborators only.
# DOCUSIGN_SERGIK_NAME=SERGIK
# DOCUSIGN_ENV=demo           # production uses account.docusign.com
# DOCUSIGN_CONNECT_HMAC=      # Connect HMAC secret. Status is still confirmed with a live envelope fetch.

# ============================================
# AI — Admin assistant + Sonic DNA review/challenge (Optional)
# Anthropic (recommended): https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=
# Optional model override (default: claude-sonnet-4-6)
# ANTHROPIC_CHAT_MODEL=claude-sonnet-4-6
# SergikAI local turns call this model once to write the intelligence brief (default claude-opus-5-5).
# ANTHROPIC_HARNESS_MODEL=claude-opus-5-5
# Cursor plan is the reasoning brain when this key is set. It does not use ANTHROPIC_API_KEY.
# Create the key at https://cursor.com/dashboard/integrations
# CURSOR_API_KEY=
# SERGIK_CURSOR_MODEL=auto
# Force one provider: anthropic | openai | ollama | crowelogic
# Local dev with an empty Anthropic balance: ADMIN_AI_CHAT_PROVIDER=ollama
ADMIN_AI_CHAT_PROVIDER=anthropic
# Local Ollama fallback (default http://127.0.0.1:11434). Use a fast model for reviews.
# Same model as the sergik-chat MCP (`chat`). `cursor_chat` is separate and uses CURSOR_API_KEY.
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=sergikai:latest
# Admin chat uses qwen2.5vl:7b (same weights, no Ableton card) unless this is set.
# OLLAMA_ADMIN_MODEL=qwen2.5vl:7b
# ADMIN_AI_OLLAMA_TIMEOUT_MS=120000

# OpenAI alternative
# OPENAI_API_KEY=
# OPENAI_CHAT_MODEL=gpt-4o-mini

# GPT-6.1 Sol admin chat — https://gpt61.crowelogic.com/v1 model gpt-6.1-sol.
# OpenAI-compatible, non-streaming. 5 credits per request. 3,000 per period through 2026-10-22. No overage.
# The first issued key was revoked. Leave CROWELOGIC_API_KEY empty until a replacement arrives.
# CROWELOGIC_API_KEY=
# CROWELOGIC_BASE_URL=https://gpt61.crowelogic.com/v1
# CROWELOGIC_MODEL=gpt-6.1-sol
# Local bridge only: CROWELOGIC_BASE_URL=http://127.0.0.1:8011
# CROWE_API_KEY is Crowe Creative (below) and does not enable chat.

# OlliN Pro / SergikAI harness (Admin AI `/exec query_intelligence_harness`)
# Same API as Cursor MCP user-ollin-pro-sergikai (harness_probe, knowledge_search).
# AIBLETON_API_BASE=http://127.0.0.1:8000
# AIBLETON_MCP_JWT=   # optional Bearer for secured local API
# AIBLETON_MCP_SESSION_ID=  # optional default chat session (MCP + Admin AI query_sergikai_chat)
# CROWE_API_KEY=            # Crowe Creative media API (same key as OlliN Pro Providers)
# CROWE_API_URL=https://api.crowelogic.com

# ============================================
# ISRC (Optional — Studio assign defaults to QTA53)
# ============================================
# US ISRC Agency Rights Owner prefix allocated 2026-09-17 to Jordan Caboga.
# ISRC_PREFIX=QTA53

# SoundExchange / SX Direct (optional — Pipeline → ISRCs works in local registry mode without these)
# Minting ISRCs in Release Studio always writes a local SX Direct queue row.
# SOUNDEXCHANGE_API_KEY=
# SOUNDEXCHANGE_ACCOUNT_ID=2181363681
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
- `NEXT_PUBLIC_R2_BROWSER_PLAY=1` — optional. Signed R2 URLs are already playable. Set this only to allow an unsigned public CDN host in `<audio>`.
- Spotify API (only if using Spotify integration)
- YouTube API (only if using YouTube integration)
- Instagram API (only if auto-fetching Instagram posts - otherwise use manual post URLs)
- AI APIs (OpenAI/Anthropic for Sonic DNA analysis)
