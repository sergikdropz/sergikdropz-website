# Vercel Pre-Deploy Checklist

Run from `web/` before promoting to production:

```bash
npm ci
npm run deploy:check
```

This runs:

- `lint:gate`
- `typecheck`
- `vercel:preflight` (required production env vars)
- `build`

For pull requests, also run `npm run knowledge:verify` (or `knowledge:build` and commit `knowledge/generated/site-knowledge.json`) when routes under `app/` change — see `web/CONTRIBUTING.md`.

## Required Vercel env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `FAN_VAULT_UNLOCK_SECRET` (min 16 chars)

## Recommended env vars

- `SENTRY_DSN` and/or `NEXT_PUBLIC_SENTRY_DSN`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID` (Instagram Graph API — reliable feed/thumbnails; renew long-lived tokens in Meta Business Suite before expiry)

## Cursor / MCP tokens (local IDE only)

- Do not commit live GitHub or Firecrawl keys. Copy `.cursor/mcp.json` patterns locally and set secrets in **Cursor Settings → MCP**, or use env-backed tooling described in `AGENTS.md`.

## Deploy flow (Vercel)

1. Ensure Supabase migrations are applied (including `add_stripe_webhook_events.sql`).
2. Ensure Stripe webhook endpoint and signing secret are configured for production domain.
3. Deploy from Git or run `vercel --prod`.
4. Run post-deploy smoke checks:
   - `/`
   - `/shop`
   - `/music-library` (guest redirect behavior)
   - `/api/health/deps` (expect `status: ok`, HTTP 200)
   - one Stripe checkout path
   - one admin route

## Optional CI auto-probe after main deploy

Set repository variable `PRODUCTION_HEALTHCHECK_URL` (for example `https://sergikdropz.com`).
When set, `Web CI` will run a final production probe against:

- `${PRODUCTION_HEALTHCHECK_URL}/api/health/deps`

You can also run manual smoke checks any time from GitHub Actions:

- Workflow: `Post-Deploy Smoke`
- Input: `base_url` (for example `https://sergikdropz.com`)
