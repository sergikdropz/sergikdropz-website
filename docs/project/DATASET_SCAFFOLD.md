# Dataset Scaffold — Complete Indexing and Knowledge Base

This folder contains the complete dataset scaffold, JSON Schemas, CSV templates, ETL validators, and KB documentation for the intellijend platform analysis.

## Folder Structure

```
data/
  schema/              # JSON Schemas for all primary entities
    artists.schema.json
    campaigns.schema.json
    metrics.schema.json
    pricing.schema.json
    testimonials.schema.json
    leaderboard.schema.json
    faqs.schema.json
    pages.schema.json
    integrations.schema.json
    media.schema.json
    users.schema.json
    onboarding.schema.json
    legal.schema.json
  templates/           # CSV import/export templates
    campaigns.csv
    metrics.csv
  mapping.json         # Machine-readable entity mappings
  mapping.yaml         # YAML version for pipeline ingestion
  README.md            # Data folder docs

kb/
  taxonomy.md          # KB taxonomy and tags
  ingestion.md         # Ingestion and embeddings guidance

analysis/
  page_to_dataset_mapping.md     # Detailed page section → entity mappings
  tech_stack_audit.md            # Inferred tech stack and roadmap

scripts/
  etl_validate.py      # Python validator (pandas + jsonschema)
  etl_validate.js      # Node.js validator (ajv + csv-parser)

examples/
  metric_snapshot.json # Example JSON row

requirements.txt       # Python dependencies
package.json          # Node.js dependencies
README_ETL.md         # ETL usage guide
```

## Quick Start

### Python validator

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/etl_validate.py --csv data/templates/metrics.csv --schema data/schema/metrics.schema.json
```

### Node.js validator

```bash
npm install
npm run validate:metrics
npm run validate:campaigns
```

## Key Entities

1. **Artist** — Artist profile with Spotify integration
2. **Campaign** — Marketing campaign with Meta Ads targeting
3. **MetricSnapshot** — Time-series metric snapshot (monthly listeners, streams, popularity score)
4. **PricingPlan** — Subscription tiers and promotions
5. **Feature** — Product capabilities and integrations
6. **Testimonial** — User reviews and endorsements
7. **LeaderboardEntry** — Top-performer case studies
8. **FAQ** — Knowledge base entries
9. **ContentPage** — Marketing pages and SEO content
10. **Integration** — Meta Ads, Spotify API, Stripe, etc.
11. **MediaAsset** — Images, videos, ad creatives
12. **UserAccount** — User profiles and role management
13. **OnboardingEvent** — Onboarding workflow state
14. **LegalDoc** — Privacy, ToS, refund policy

## Data Governance

- **Timestamps**: All records use UTC ISO8601 format
- **Provenance**: Every record includes `source`, `ingested_at`, and confidence metadata
- **Privacy**: PII fields flagged; encryption and ACL applied
- **Versioning**: Schema version tracked; changelog in root `mapping.json`

## Learning Path for Future Development

1. **Phase 1 (Now)**: Canonical schemas, CSV templates, mapping docs → foundation for all ingestion
2. **Phase 2**: Implement database schema (Postgres + Supabase) with matching entity models
3. **Phase 3**: Build ETL pipelines (airflow or serverless) to ingest Spotify + Meta + user data
4. **Phase 4**: Materialized views for derived metrics (thresholds, velocities, predictions)
5. **Phase 5**: Semantic KB with embeddings (Pinecone/Vector DB + embeddings API)
6. **Phase 6**: Real-time alerting and recommendation engine

## File Descriptions

| File | Purpose |
|------|---------|
| `data/schema/*.json` | JSON Schema validation for each entity type |
| `data/mapping.json` | Machine-readable page-to-entity mappings |
| `kb/taxonomy.md` | Canonical topic tags for KB docs and embeddings |
| `analysis/page_to_dataset_mapping.md` | Human-readable mappings with context |
| `analysis/tech_stack_audit.md` | Inferred stack and recommendations |
| `scripts/etl_validate.py` | Python validator for CSV rows |
| `scripts/etl_validate.js` | Node.js validator for CSV rows |

## Next Steps

1. Populate `data/` with actual intellijend data (via APIs or exports)
2. Build database schemas in Postgres (use JSON Schemas as reference)
3. Implement data pipelines to refresh metrics hourly/daily
4. Add embeddings pipeline for KB documents
5. Create alerting logic around popularity thresholds and stream velocity

---

Generated: 2026-01-28
