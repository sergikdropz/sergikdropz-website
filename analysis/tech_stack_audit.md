# intellijend — inferred tech stack audit

Source: public landing page content and product descriptions.

Inferred frontend:
- React + Next.js (SEO, server-rendered pages implied by marketing site)
- Tailwind (site in this workspace uses Tailwind elsewhere)
- Client-side libs: wavesurfer.js, tone.js, peaks.js (for audio UX)

Inferred backend / services:
- Meta Ads integration (Facebook/Instagram Ads API + Pixel / Conversions API)
- Spotify Data ingests (Spotify Web API + Spotify for Artists data via OAuth)
- Payments via Stripe (stripe-node or stripe SDKs)
- Auth + data: Supabase (Postgres + Auth) — referenced in project docs
- Storage: S3-compatible or Supabase Storage for media

Data & analytics:
- Time-series metrics (monthly listeners, streams, followers, popularity score)
- Event-driven campaign data (ad spend, creatives, targeting, conversions)
- Materialized views for derived features (popularity thresholds, velocity)
- Semantic KB with embeddings for insights, FAQs, and recommendations

Operational infra suggestions:
- Primary DB: Postgres (hosted via Supabase)
- Worker queue: Redis + Bull / Sidekiq or serverless background jobs for ingestion and embedding generation
- Embeddings store: vector DB (Pinecone/Weaviate/RedisVector) or Supabase Vector
- Hosting: Vercel for frontend; serverless functions for API endpoints
- Observability: Sentry + Prometheus + Grafana for metrics

Security & compliance:
- GDPR: consent tracking for any PII collected (emails, team contacts)
- Encryption for PII at rest; role-based access for KB/documentation

Short roadmap for data maturity:
1. Create canonical JSON Schemas (done) and CSV templates.
2. Implement ingestion pipeline that tags provenance and confidence.
3. Maintain rolling time-series snapshots for key metrics (hourly/daily).
4. Add automated alerting for threshold triggers and suggestion pipelines.
