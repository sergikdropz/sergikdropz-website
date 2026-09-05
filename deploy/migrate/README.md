# SERGIK → Cloudflare R2

Two modes:

| Mode | Script | Layout |
| --- | --- | --- |
| **Backup** (insurance copy) | `npm run backup:all` | `backup/YYYY-MM-DD/audio/...` |
| **Production** (live streaming) | `npm run r2:production:all` | `audio/...` at bucket root |

Production objects match the media proxy: `{R2_PUBLIC_BASE_URL}/audio/{vault-relative-path}`.

## One-time Cloudflare setup

1. [Cloudflare Dashboard → R2](https://dash.cloudflare.com/?to=/:account/r2)
2. Note your **Account ID** (right sidebar on R2 overview).
3. **Manage R2 API Tokens** → Create token → **Object Read & Write** on bucket `sergik-vault` (or account-wide for first run).
4. **My Profile → API Tokens** → Create token → permission **Account → Cloudflare R2 → Edit** (for public `r2.dev` URL).

## Configure credentials

```bash
cd deploy/migrate
cp .env.example .env
# fill R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_API_TOKEN
npm install
```

## Production cutover (recommended)

**Automated (Playwright + AppleScript):** opens Chrome, walks Cloudflare R2 setup, saves credentials, uploads, cuts over Vercel:

```bash
npm run r2:production:all
```

You'll get macOS notifications + dialogs when login or token copy is needed. Screenshots: `out/playwright-r2-shots/`.

Or step by step:

```bash
npm run r2:setup:browser      # Playwright: bucket + tokens → .env
npm run r2:production:upload   # → out/MANIFEST.production.json
npm run r2:production:public   # writes R2_PUBLIC_BASE_URL to .env
npm run r2:production:verify   # HEAD check R2 + public URL
npm run r2:production:cutover  # Vercel env + redeploy + audio smoke
```

After cutover, **stop the Mac media-server + trycloudflare tunnel** — production no longer needs your laptop online.

## Backup-only (no cutover)

Home-server Docker must be running for DB dump:

```bash
npm run backup:all
```

Re-runs skip existing objects (`R2_SKIP_EXISTING=0` to force re-upload).

## Optional: custom domain

DNS for `sergikdropz.com` is on Vercel today. For `media.sergikdropz.com` → R2:

1. Add the domain (or subdomain) to your Cloudflare account.
2. R2 bucket → **Settings → Custom Domains** → connect `media.sergikdropz.com`.
3. Set `R2_PUBLIC_BASE_URL=https://media.sergikdropz.com` in `.env` and re-run `npm run r2:production:cutover`.

## Layout reference

**Production bucket:**

```
audio/unreleased/...
waveforms/...
MANIFEST.production.json
```

**Backup bucket prefix:**

```
backup/YYYY-MM-DD/
  MANIFEST.json
  db/sergik-public.dump.sql
  audio/...
  waveforms/...
```
