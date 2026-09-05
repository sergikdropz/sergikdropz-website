# Contributing to `web/` (SERGIK)

## First-time setup

```bash
cd web
npm ci
```

### Playwright (E2E)

Browsers are not installed by `npm ci`. Install Chromium before running E2E locally:

```bash
npm run test:e2e:install-browsers
# or: npx playwright install chromium
```

Then:

```bash
npm run test:e2e
```

Guest suites run without credentials. **Authenticated admin UI** tests (`admin-authenticated`, `admin-ui-crawl`) require:

```bash
export E2E_ADMIN_EMAIL='…'
export E2E_ADMIN_PASSWORD='…'
npm run test:e2e
```

In **GitHub Actions** (`Web CI` workflow), add repository **Secrets** `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` so the admin crawl runs on every PR.

## Site knowledge snapshot (routes + admin crawl drift)

The inventory refreshes automatically on `npm run build`, `dev:ensure` / `dev` start, while the
dev daemon watches `app/` route files, and on pre-commit. Manual rebuild:

```bash
npm run knowledge:build
```

Commit both generated files when they change:

- `knowledge/generated/site-knowledge.json`
- `web/lib/generated/site-knowledge.json`

CI runs `npm run knowledge:verify` and fails if either snapshot is stale.

See `knowledge/SITE_INDEX.md` at the repo root for the full AI/team index.

## Pre-merge checks (mirrors CI)

From `web/`:

```bash
npm run lint:gate
npm run typecheck
npm run test:unit
npm run knowledge:verify
npm run vercel:build
```

Or the full local deploy gate (includes production env checks when vars are set):

```bash
npm run deploy:check
```

## Production monitoring (repo admins)

- **Repository variable** `PRODUCTION_HEALTHCHECK_URL` — e.g. `https://sergikdropz.com`. When set, the `Web CI` workflow runs the **Production health probe** job on pushes to `main` (`npm run health:probe`).
- **Workflow** `Post-Deploy Smoke` — manual run with base URL `https://sergikdropz.com` for HTTP checks plus `health:probe`.

Details: `docs/deployment/DEPLOYMENT_GUIDE.md` (GitHub Actions section).

## PR checklist

See `.github/PULL_REQUEST_TEMPLATE.md`.
