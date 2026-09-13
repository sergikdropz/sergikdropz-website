# Pull Request Checklist

## Summary

- Describe the change and why it is needed.

## Validation

- [ ] `web`: `npm run lint:gate` (auth + middleware ESLint gate)
- [ ] `web`: `npm run typecheck`
- [ ] `web`: `npm run test:unit`
- [ ] `web`: routes/knowledge auto-synced (`npm run knowledge:verify` — rebuild happens on build/pre-commit; commit both generated JSON files if changed)
- [ ] `web`: `npm run vercel:build`
- [ ] `web`: `npm run test:e2e` (after `npm run test:e2e:install-browsers` locally), or confirm CI green

## GitHub repository settings (admins)

- [ ] **Secrets** `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set if this PR needs authenticated Playwright coverage in CI
- [ ] **Variable** `PRODUCTION_HEALTHCHECK_URL` is set (e.g. `https://sergikdropz.com`) if you want the production health probe on `main`

## Deployment readiness (Vercel)

- [ ] Required production env vars are documented/confirmed
- [ ] Supabase migrations required by this PR are documented
- [ ] Stripe webhook impact reviewed (if applicable)
- [ ] Post-deploy smoke plan noted (`Post-Deploy Smoke` workflow)

## Risk and rollback

- **Risk level:** low / medium / high
- **Rollback:** previous Vercel deployment / previous commit

## Contributor reference

- `web/CONTRIBUTING.md` — Playwright install, E2E secrets, knowledge snapshot, local commands
