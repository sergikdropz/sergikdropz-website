# Release Collab setup

Internal per-release collaborators, in-app thread, magic-link review portal, and Resend delivery tracking.

## Already done in the repo / cloud DB

- Tables from `web/supabase/migrations/add_release_collab.sql` (apply: `node scripts/apply-release-collab-migration.mjs`)
- Studio nav + admin sidebar group **Release Studio → Release Collab**
- Hub UI `/studio/collab`
- Public portal `/collab/[token]`
- APIs under `/api/studio/.../collab` and `/api/collab/[token]`
- Webhook receiver `/api/webhooks/resend`
- Outbound From: **`release.studio@sergikdropz.com`** (also Rights contract send)

## Required: Resend account

1. **API key** — https://resend.com/api-keys → add to `web/.env.local`:

   ```bash
   RESEND_API_KEY=re_...
   ```

2. **Domain** — verify `sergikdropz.com` in Resend → Domains (DNS). After that, `release.studio@sergikdropz.com` is a valid From address (no separate mailbox required).

3. **Webhook** (production):

   ```bash
   WEBHOOK_URL=https://sergikdropz.com/api/webhooks/resend \
     node scripts/setup-release-collab-resend.mjs --create-webhook
   ```

   Or create manually in Resend → Webhooks:
   - Endpoint: `https://sergikdropz.com/api/webhooks/resend`
   - Events: `email.sent`, `email.delivered`, `email.opened`, `email.bounced`, `email.complained`
   - Copy signing secret → `RESEND_WEBHOOK_SECRET=whsec_...` in `.env.local` **and** Vercel env

4. Restart local: `npm run dev:restart`

## Smoke test

1. Open `/studio/collab` (admin)
2. Pick a release → Add collaborator (your email) → **Email review link**
3. Open the portal URL → Play → Approve
4. Confirm thread + email log status on the hub
5. After webhook is live, status should move sent → delivered → opened

## Local without Resend

Thread + collaborators still work. Notify / invite send returns a clear error until `RESEND_API_KEY` is set.
