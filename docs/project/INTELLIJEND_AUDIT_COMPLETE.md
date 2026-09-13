# intellijend Dataset Scaffold — Complete Audit & Deliverables

## Executive Summary

A comprehensive dataset scaffold has been created for the intellijend music marketing platform (https://www.intellijend.com). This includes:

- **13 canonical JSON Schemas** for all primary entities (artists, campaigns, metrics, pricing, testimonials, etc.)
- **2 ETL validators** (Python + Node.js) with full CSV validation
- **Machine-readable mappings** (JSON + YAML) linking page content to database entities
- **Knowledge base taxonomy** and ingestion guidance for semantic search
- **Tech stack audit** with infrastructure recommendations
- **Complete example rows** and CSV templates ready for ingestion
- **ZIP archive** with all deliverables (19 KB, ready to download)

---

## Audit Results

### Inferred Tech Stack

#### Frontend
- React + Next.js (SSR/SSG for marketing site)
- Tailwind CSS
- Audio libraries: wavesurfer.js, tone.js, peaks.js

#### Backend / Services
- Meta Ads API (campaign management + pixel tracking)
- Spotify Web API (artist metrics, playlist tracking)
- Stripe SDK (payment processing)
- Supabase (Postgres + Auth + Storage)

#### Data & Analytics
- Time-series metrics: monthly listeners, streams, followers, popularity score
- Event-driven data: campaign spend, creatives, targeting, conversions
- Derived features: popularity thresholds, stream velocity, algorithmic triggers
- Semantic KB with embeddings for insights, FAQs, recommendations

#### Recommended Infrastructure
- **Primary DB**: Postgres (via Supabase)
- **Worker Queue**: Redis + Bull / Sidekiq or serverless functions
- **Embeddings Store**: Pinecone / Weaviate / Supabase Vector
- **Hosting**: Vercel (frontend), serverless API (backend)
- **Observability**: Sentry + Prometheus + Grafana

---

## Deliverables

### 1. JSON Schemas (13 files)

| Schema | Purpose | Key Fields |
|--------|---------|-----------|
| `artists.schema.json` | Artist profiles | id, name, spotify_artist_id, monthly_listeners, popularity_score, genres |
| `campaigns.schema.json` | Marketing campaigns | id, artist_id, budget_total_usd, frontload_pattern, targeting, status |
| `metrics.schema.json` | Time-series snapshots | entity_type, monthly_listeners, streams_28d, popularity_score, stream_velocity_28d |
| `pricing.schema.json` | Subscription tiers | name, billing_period, price_usd, discount_code, features |
| `testimonials.schema.json` | User reviews | author_name, quote, rating, source (trustpilot, in-platform) |
| `leaderboard.schema.json` | Top performers | rank, artist_id, monthly_listeners_before/after, ad_spend |
| `faqs.schema.json` | Knowledge base | question, answer, tags, related_docs |
| `pages.schema.json` | Marketing content | slug, title, body_markdown, ctas, meta_description |
| `integrations.schema.json` | API connections | name, type (ads, music, payments), capabilities, setup_steps |
| `media.schema.json` | Assets (images, video) | type, url, width, height, duration_sec, usage |
| `users.schema.json` | User accounts | email, role (artist, manager, admin, agency), subscription_plan_id |
| `onboarding.schema.json` | Workflow state | user_id, step_key, status, started_at, completed_at |
| `legal.schema.json` | Legal documents | type (privacy, tos, refund), content_markdown, effective_date |

### 2. ETL Validators

#### Python validator
```bash
python3 scripts/etl_validate.py --csv data/templates/metrics.csv --schema data/schema/metrics.schema.json
# Output: {"status": "ok", "rows_validated": 1}
```

Features:
- Validates CSV rows against JSON Schema
- Type casting (integer, number, array)
- Error reporting with row numbers and validation details
- Exit codes: 0 = success, non-zero = errors

#### Node.js validator
```bash
npm install
npm run validate:metrics
npm run validate:campaigns
```

Features:
- Uses ajv (JSON Schema validator) + csv-parser
- Same validation logic as Python version
- CLI with --csv and --schema arguments
- Streamable for large files

### 3. Machine-Readable Mappings

#### data/mapping.json
Links 9 page blocks to database entities:
- hero → ContentPage
- pricing_table → PricingPlan
- dashboard_metrics → MetricSnapshot
- campaign_flow → Campaign
- insights → KBDoc
- leaderboard → LeaderboardEntry
- testimonials → Testimonial
- faq → FAQ
- legal → LegalDoc

#### data/mapping.yaml
YAML version for pipeline ingestion and orchestration tools.

### 4. Knowledge Base Taxonomy

**Tags for KB indexing:**
- product:dashboard, product:campaigns, product:insights, product:leaderboard, product:pricing
- integrations:spotify, meta, stripe, supabase
- analytics:popularity_score, stream_velocity, algorithmic_boost
- onboarding:connect_accounts, launch_campaign
- legal:privacy, tos, refunds
- case_studies, testimonials, faqs, troubleshooting, howto

**Ingestion process:**
1. Normalize content to plain text; extract metadata
2. Create KB doc with id, title, content_text, tags, related_entities
3. Generate embeddings (store vector_id, model, dims)
4. Track provenance (ingested_at, source_doc_id, confidence)

### 5. CSV Templates

#### data/templates/campaigns.csv
Headers: id, artist_id, name, status, start_date, end_date, budget_total_usd, budget_daily_usd, ad_account_id, landing_page_url, conversion_metric, created_at, updated_at

Example row:
```csv
c_001,artist_123,Frontload Jan Release,running,2026-01-14,2026-02-11,300,10,adacct_456,https://lp.example.com/track,spotify_stream,2026-01-10T09:00:00Z,
```

#### data/templates/metrics.csv
Headers: id, entity_type, entity_id, snapshot_time, monthly_listeners, streams_28d, followers, popularity_score, stream_velocity_28d, ad_spend_28d_usd, source, tags

Example row:
```csv
ms_0001,artist,artist_123,2026-01-28T12:00:00Z,27100,89200,1250,38,3200,210,spotify,"release-cycle;need-action"
```

### 6. Example Rows

**examples/metric_snapshot.json**
```json
{
  "id":"ms_0001",
  "entity_type":"artist",
  "entity_id":"artist_123",
  "snapshot_time":"2026-01-28T12:00:00Z",
  "monthly_listeners":27100,
  "streams_28d":89200,
  "followers":1250,
  "popularity_score":38,
  "stream_velocity_28d":3200,
  "ad_spend_28d_usd":210,
  "source":"spotify",
  "ingested_at":"2026-01-28T12:05:00Z",
  "tags":["release-cycle","need-action"]
}
```

### 7. Analysis Documents

#### analysis/page_to_dataset_mapping.md
Detailed human-readable mapping of each landing page section (hero, pricing, dashboard, campaigns, insights, leaderboard, testimonials, FAQ, legal) to dataset entities and datablocks.

Recommended sub-branch structure:
- analytics/ (metrics_snapshots, derived_features)
- product/ (features, campaign_templates)
- kb/ (docs, embeddings)
- content/ (pages, media)
- infra/ (provenance, schema_version)

#### analysis/tech_stack_audit.md
- Inferred frontend: React, Next.js, Tailwind, wavesurfer.js
- Inferred backend: Meta Ads, Spotify API, Stripe, Supabase
- Recommended infra: Postgres, Redis, Pinecone, Vercel, Sentry
- Data maturity roadmap (5 phases)

### 8. Deliverable Files

| File | Purpose |
|------|---------|
| `DATASET_SCAFFOLD.md` | Overview + quick start guide |
| `README_ETL.md` | ETL validator usage guide |
| `requirements.txt` | Python dependencies (jsonschema, pandas, pyyaml) |
| `package.json` | Node.js dependencies (ajv, csv-parser) |
| `intellijend_dataset_scaffold.zip` | Complete archive (19 KB) |

---

## Data Governance

### Timestamps
- All records use UTC ISO8601 format (e.g., `2026-01-28T12:00:00Z`)
- Fields: `created_at`, `updated_at`, `snapshot_time`, `ingested_at`

### Provenance
- Every record includes: `source`, `source_id`, `ingested_at`, `confidence` (0.0-1.0)
- Allows audit trail and data quality tracking

### Privacy & Compliance
- PII fields marked with `pii:true` flag (emails, team_members)
- Encryption at rest; role-based access control
- GDPR: retention metadata per record

### Versioning
- Schema version in root `mapping.json`
- Changelog tracked for all schema updates

---

## Learning Path for Future Development

### Phase 1 (Now) ✅
- Canonical JSON Schemas
- CSV templates
- Mapping documentation
- Validation scripts
- **Outcome**: Foundation for data ingestion pipelines

### Phase 2 (Database)
- Create Postgres schema using JSON Schemas as reference
- Build Supabase tables with matching entity models
- Set up initial data import

### Phase 3 (Pipelines)
- ETL orchestration (Airflow, Temporal, or serverless)
- Scheduled ingestion from Spotify + Meta APIs
- Data quality checks and alerting

### Phase 4 (Derived Features)
- Materialized views for popularity thresholds
- Stream velocity calculations
- Predictive models (next threshold ETA)

### Phase 5 (Semantic KB)
- Embeddings generation (OpenAI, Cohere)
- Vector DB integration (Pinecone, Supabase Vector)
- Semantic search for KB docs

### Phase 6 (Real-Time Features)
- Alert engine for threshold crossings
- Recommendation system for release timing
- Live dashboard updates

---

## ZIP Archive Contents

**File**: `intellijend_dataset_scaffold.zip` (19 KB)

```
intellijend_dataset_scaffold/
├── data/
│   ├── schema/              # 13 JSON Schemas
│   ├── templates/           # CSV templates
│   ├── mapping.json         # Machine-readable mapping
│   ├── mapping.yaml         # YAML version
│   └── README.md
├── kb/
│   ├── taxonomy.md          # KB tags and structure
│   └── ingestion.md         # Embeddings guidance
├── analysis/
│   ├── page_to_dataset_mapping.md
│   └── tech_stack_audit.md
├── scripts/
│   ├── etl_validate.py      # Python validator
│   └── etl_validate.js      # Node.js validator
├── examples/
│   └── metric_snapshot.json
├── requirements.txt         # Python deps
├── package.json            # Node.js deps
├── README_ETL.md           # Usage guide
└── DATASET_SCAFFOLD.md     # This overview
```

---

## Next Steps

1. **Extract ZIP** and review schema files
2. **Run validators** on your own CSV data
3. **Populate database** schema in Postgres (use JSON Schemas as reference)
4. **Implement pipelines** to refresh metrics from APIs hourly/daily
5. **Add embeddings** pipeline for KB documents
6. **Set up alerting** for popularity thresholds and stream velocity triggers

---

## Files in Workspace

All files are now in the workspace root:
- `data/` folder with all schemas, templates, and mappings
- `kb/` folder with taxonomy and ingestion docs
- `analysis/` folder with audit and mapping docs
- `scripts/` folder with ETL validators
- `examples/` folder with sample JSON rows
- `DATASET_SCAFFOLD.md` (this document)
- `README_ETL.md` (ETL usage guide)
- `requirements.txt` and `package.json`
- **`intellijend_dataset_scaffold.zip`** (ready for download/sharing)

---

Generated: 2026-01-28
Audit: intellijend (https://www.intellijend.com)
