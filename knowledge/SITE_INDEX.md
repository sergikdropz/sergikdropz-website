# SERGIK site knowledge index (AI + team)

This file is the **entry point** for deep, repo-grounded context about the public site, admin, studio, APIs, tests, and CI. Prefer it over guessing routes or auth rules.

## Tiered sources (read order)

| Priority | Path | Role |
| --- | --- | --- |
| 1 | [CANON.md](./CANON.md) | Stable product facts, URL, tone, stack; keep short. |
| 2 | **This file** | How the site is organized, where stats live, how to refresh them. |
| 3 | [generated/site-knowledge.json](./generated/site-knowledge.json) | Machine snapshot: every App Router page and route handler path, file mapping, category counts, middleware notes, E2E crawl drift vs `web/app`. |
| 4 | [../AGENTS.md](../AGENTS.md) | Agent workflow, dev server, stack summary. |

Regenerate the JSON snapshot after adding or moving pages under `web/app/`:

```bash
cd web && npm run knowledge:build
```

This usually happens automatically:

| Trigger | Behavior |
| --- | --- |
| `npm run build` / Vercel | `prebuild` regenerates both snapshots before Next compiles |
| `npm run dev` / `dev:ensure` | Rebuilds on start; the dev daemon also runs `knowledge:watch` |
| Route add/move under `web/app` | Watcher rewrites the inventory within ~1s |
| Pre-commit hook | Rebuilds and stages the generated JSON so commits stay current |

CI runs `npm run knowledge:verify` (`build-site-knowledge.mjs --check`) in the typecheck job. That compares both on-disk snapshots (`knowledge/generated/` and `web/lib/generated/`) to a fresh scan. If you change routes without refreshing, the job fails. Keep both generated files committed.

## Admin AI runtime grounding

The Admin AI chat route consumes this snapshot through
`web/lib/ai/site-knowledge-context.ts`. Every chat receives a compact architecture
summary plus query- and current-page-specific route/file matches. The snapshot hash
and selected paths are recorded with the AI run response for traceability.

The full route table is deliberately retrieved selectively instead of being copied
into every model prompt. This keeps prompts bounded while preserving exact route
grounding. The runtime treats the index as proof of static architecture only; live
database state and writes still require registered Admin AI tools and the
Preview → Approve flow.

## Production vs local

| Environment | Base URL | Checks |
| --- | --- | --- |
| Local (agents / Playwright) | `http://127.0.0.1:3001` (see `web/playwright.config.ts`) | `npm run dev:ensure && npm run dev:verify` |
| Local E2E setup | — | See `web/CONTRIBUTING.md` (browser install + `E2E_ADMIN_*` for admin crawl). |
| Production | **https://sergikdropz.com** (also set in CANON) | GitHub Actions job **Production health probe** on `main` when `vars.PRODUCTION_HEALTHCHECK_URL` is set; hits `npm run health:probe` against `/api/health/deps`. Manual **Post-Deploy Smoke** workflow (`.github/workflows/post-deploy-smoke.yml`) can probe a chosen base URL plus `curl` checks on `/`, `/shop`, `/music-library`, `/api/health`. |

## Scope: “training” vs agent context

This repo ships **ground truth for assistants** (structured JSON + index). Fine-tuning or hosted embedding pipelines are **not** defined here; ingest `knowledge/generated/site-knowledge.json` and markdown under `knowledge/` into your vector store or tooling if you want RAG beyond Cursor.

- **Admin UI and Studio:** `web/middleware.ts` requires an admin-capable session for `/admin/*` (except `/admin/login`, `/admin/setup`), `/studio/*`, and `/api/admin/*`. Unauthenticated users are redirected to `/admin/login` (401 for APIs).
- **Fan:** `/fan/*`, `/api/fan/*` get session refresh behavior when matched; see middleware source for full conditions.
- **Music library:** gated flows for `/music-library` and `/api/music-library/*` (refresh + access rules in middleware).
- **Membership:** `/api/membership/status` and `/shop/membership/manage` participate in refresh logic.

Exact matcher list: see `middleware.config.matcher` in `web/middleware.ts` and the `generated/site-knowledge.json` → `middleware` section.

## E2E coverage map

| Suite | Spec files | Credentials |
| --- | --- | --- |
| Guest / public | `admin-guest`, `admin-api`, `admin-audit`, `admin-a11y`, `fan-public` | None |
| Authenticated admin | `admin-authenticated`, `admin-ui-crawl` | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (storage state in `e2e/.auth/admin.json`) |

Static admin paths crawled in UI tests: `web/e2e/admin-ui-paths.ts` (`ADMIN_UI_CRAWL_PATHS`). The knowledge build compares this list to real `web/app/admin/**/page.tsx` routes and reports drift in `generated/site-knowledge.json` → `e2e.drift`.

## Major surface areas (conceptual)

| Area | Typical paths | Code roots |
| --- | --- | --- |
| Public marketing / music | `/`, `/music`, `/epk`, `/book`, `/shop`, … | `web/app/` (non-admin) |
| Fan portal | `/fan/*` | `web/app/fan/` |
| Admin CMS | `/admin/*` | `web/app/admin/`, `web/components/admin-nav-items.ts` |
| Release Studio | `/studio/*` | `web/app/studio/`, `web/app/api/studio/` |
| Integrations | Stripe, Supabase, Resend, Instagram helpers | `web/app/api/`, `web/lib/` |

## Stack (frozen summary)

Next.js 14 (App Router), TypeScript, Tailwind, Supabase (auth + data), Stripe, Sentry, Playwright, Vitest. Audio: wavesurfer.js, tone.js, peaks.js, BPM tools — **no autoplay**; user-initiated playback only.

## Documentation archive

Stale operational markdown files (172 files) were archived from the `web/` root to **`web/docs/archive/`** in May 2026. These include old planning docs, sprint notes, and feature exploration files accumulated over development. If you're looking for a specific historical document, check that directory.

## Optional external grounding

Vercel, Supabase, Sentry, and scrape-based tools are documented in `.cursor/skills/sergik-mcp-knowledge/SKILL.md`. Do not commit live tokens; use MCP or env locally.
