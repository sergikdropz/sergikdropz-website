# Agent Instructions

## Project Context (Read First)
- This repo is a Next.js 14 + TypeScript + Tailwind site for a music artist and DJ software developer.
- Data + auth are handled with Supabase; payments are Stripe.
- Audio UX is core: wavesurfer.js, tone.js, peaks.js, and BPM analysis tools are already in the stack.
- State/data fetching uses @tanstack/react-query and SWR; animations use framer-motion.
- Core surfaces: artist brand, streaming embeds, events/booking, DJ software hub, and future merch.
- Treat audio/video performance and UX as top priorities (no autoplay audio; user-initiated playback only).
- When given a directive, favor production-ready changes with clear, minimal steps and safe defaults.
- Site architecture grounding: `knowledge/CANON.md` → `knowledge/SITE_INDEX.md` → `knowledge/generated/site-knowledge.json` (auto-refreshed on build/dev/pre-commit; manual: `cd web && npm run knowledge:build`). Admin AI loads a query-scoped slice at chat time via `web/lib/ai/site-knowledge-context.ts`.

## Local dev server (required for UI work)

- **Automated:** `cd web && npm run dev:ensure` — starts a detached **dev daemon** if needed; hot-reloads on save. Also runs on workspace open via `.vscode/tasks.json` when automatic tasks are allowed.
- Dev cache: `.next-dev-3001` with polling watchers (avoids macOS `EMFILE` / broken HMR).
- **Before marking UI/code tasks done:** `npm run dev:ensure && npm run dev:verify`. Do not claim localhost works if either fails.
- Stuck/broken: `npm run dev:recover` or `npm run dev:stop` then `npm run dev:ensure`.
- Sonic DNA auto-sync: the dev daemon also runs `sonic-dna:watch` (reclassify + apply + compile on classifier/encyclopedia edits). Logs: `web/.dev/daemon.log`.
- See `.cursor/rules/dev-server.mdc`.

## Future Enhancements (Planned Direction)
- Expand Supabase usage for content workflows, scheduling, and storage-backed media assets.
- Add richer analytics dashboards and fan engagement metrics (Recharts is already installed).
- Introduce merch storefront flow and checkout optimizations (Stripe-first; add PayPal only if needed).
- Optional headless CMS integration if content editing needs outgrow Supabase admin tooling.
- Add localization and accessibility polish once core pages and data flows are stable.

Role: Senior Web Developer – Music-Integration Website
Client: Music Artist & DJ (Software Developer)
Project: A responsive, media-rich web platform that showcases the artist’s brand, streaming integration, event management, and a custom DJ software hub.

## 1. Project Scope & Deliverables

| Deliverable | Description | Acceptance Criteria |
| --- | --- | --- |
| Homepage | Hero with high-definition audio-visual loop, dynamic track list, and call-to-action (CTA). | Loads < 1 s (Lighthouse), responsive across all devices, audio autoplay only on user interaction. |
| Artist Bio & Discography | Interactive timeline, album artwork, embedded tracks (Spotify, SoundCloud). | All tracks playable, correct metadata, progressive enhancement. |
| DJ Software Hub | Landing page for software, download links, system requirements, demo video, version history. | Links open in new tab, software integrity verified with checksum. |
| Events & Booking | Calendar with filtering, RSVP form, integration with Google Calendar & iCal. | Form submits to backend, confirmation email triggers, calendar invites sent. |
| Merch Store | WooCommerce/Shopify integration, product gallery, Stripe/PayPal checkout. | Transactions succeed, orders added to admin panel, 404 for out-of-stock items. |
| Social & Media Feed | Instagram, Twitter, YouTube feed with lazy-load. | No flicker, rate-limit handled, error handling for API failures. |
| Admin Dashboard | CMS for content updates, event creation, analytics. | Role-based access, audit trail, backup routine. |
| Accessibility | WCAG 2.1 AA compliance. | Contrast ratio >= 4.5:1, keyboard navigation, aria labels. |
| SEO & Performance | Meta tags, structured data, image compression, lazy loading, code splitting. | Mobile-friendly score >= 90, FCP < 1.5 s, total page size < 2 MB. |

## 2. Technical Stack (Current + Near-Term)

| Layer | Current Stack | Notes / Near-Term Enhancements |
| --- | --- | --- |
| Front-end | Next.js 14, React 18, TypeScript, Tailwind CSS | Keep SSR/SSG where possible; use `next/image` and `next/font`. |
| Data Fetching | @tanstack/react-query, SWR | Prefer react-query for app data; SWR for simple reads. |
| Audio & Analysis | wavesurfer.js, peaks.js, tone.js, realtime-bpm-analyzer | No autoplay; user-initiated playback; lazy-load heavy audio libs. |
| Animation | framer-motion | Use for page transitions and subtle UI emphasis only. |
| Auth & Data | Supabase (Postgres + Auth) | Expand to Storage for media when ready. |
| Payments | Stripe (client + server SDKs) | Start with one-time payments; add subscriptions later. |
| Media Embeds | Spotify/SoundCloud/YouTube embeds | Click-to-load for performance and privacy. |
| Hosting | Vercel (recommended) | Edge caching + ISR for public pages. |
| Monitoring | TBD | Add Sentry when production traffic starts. |
| Accessibility | Lighthouse + axe-core | Run checks on every major UI change. |

## 3. Development Workflow

### Planning & Discovery
- Capture user stories in JIRA/ClickUp.
- Create wireframes in Figma; iterate with the client.
- Define KPIs (e.g., load time, conversion).

### Environment Setup
- Fork repo, set up branch strategy (feature -> review -> develop -> main).
- Configure TypeScript, ESLint, Prettier, Husky pre-commit hooks.

### API Design
- Draft GraphQL schema (Strapi) or REST routes (Express).
- Add authentication middleware (JWT) for admin routes.
- Document endpoints in Swagger or GraphQL Playground.

### Front-end Development
- Scaffold Next.js with TypeScript, Tailwind.
- Create atomic components: TrackCard, Hero, EventCard.
- Implement global layout with AppLayout.
- Add CSS-modules for critical styles to avoid FOUC.

### Audio/Video Integration
- Load Howler.js via next/dynamic for client-side only.
- Implement responsive video player; pre-load thumbnails.
- Add fallback audio for browsers with autoplay restrictions.

### Event Calendar
- Use react-big-calendar with iCal feed integration.
- Store events in Strapi; expose via GraphQL.
- Add email confirmation using Nodemailer + SendGrid.

### E-Commerce
- Wire Stripe Checkout Session with stripe-node.
- Store orders in PostgreSQL; connect to admin dashboard.
- Generate PDF receipts via pdfkit.

### Testing
- Unit tests: Jest + React Testing Library.
- Integration tests: Supertest for API.
- E2E: Cypress for critical flows (booking, checkout).

### Accessibility & SEO
- Run axe-core after each major commit.
- Generate meta tags per page; add structured data (schema.org).
- Optimize images via next/image.

### Deployment
- Use Vercel for Next.js; Render for API.
- Setup environment variables securely.
- Enable Cloudflare caching; set proper cache headers.

### Post-Launch
- Monitor performance via Lighthouse audits.
- Set up weekly backups for Strapi & PostgreSQL.
- Conduct A/B testing for CTA placements.

## 4. Key Considerations

| Area | Detail |
| --- | --- |
| Browser Compatibility | Test Safari, Edge, Chrome, Firefox, mobile browsers. |
| Data Privacy | GDPR/CCPA compliance for user data, cookie banners. |
| Scalability | Serverless functions for heavy tasks (audio transcoding). |
| Security | HTTPS everywhere, CSP, XSS filtering, CSRF tokens. |
| Internationalization | Provide locale support (English, Spanish) via next-i18next. |
| Music Licensing | Ensure proper attribution; use official embed codes. |
| Offline Support | Service worker for cached assets & offline audio queue. |
| Analytics | Mixpanel/Google Analytics for user behavior; heatmaps for events page. |

## 5. Deliverable Checklist
- Project repo with README, contribution guidelines.
- Fully functional demo on Vercel (frontend) + Render (API).
- Automated tests covering >80% of critical paths.
- Accessibility audit report (WCAG 2.1 AA).
- SEO audit report (Lighthouse).
- Deployment pipeline documentation.
- Final hand-off packet: credentials, API keys, hosting URLs.
- One-hour training session with client’s content team.

## 6. Communication Plan
- Daily stand-ups (15 min) via Zoom.
- Weekly progress demo (30 min) to client.
- Issue tracking: all bugs labeled bug, features labeled enhancement.
- Feedback loop: 24 h turnaround for design/content changes.

## 7. Success Metrics

| Metric | Target |
| --- | --- |
| Page Load | < 1 s (Lighthouse) |
| Error Rate | < 0.5% |
| Conversion | 5% increase in booking form submissions |
| Engagement | 30% increase in time on page for audio sections |
| SEO | Top 10 ranking for primary keywords |
