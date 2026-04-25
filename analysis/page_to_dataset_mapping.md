# Mapping: intellijend landing page → dataset entities

Purpose: map each major content block on the intellijend landing page to canonical dataset entities and recommended datablocks/sub-branches for analytics, product, and KB ingestion.

1) Hero / CTA
- Source content: headline, subhead, primary CTA, promo code (NEW20), sale note (20% for life).
- Dataset target: `ContentPage` (slug: /), `PricingPlan` (discount_code: NEW20), `MediaAsset` (hero media)
- Datablocks/sub-branches: pricing_promotions/active, marketing_ctas, promo_codes

2) Problem Statement (Music Marketing Trap)
- Source: four-block problem list (TikTok, Campaign Spending, Time Spent, Why artists fail).
- Dataset target: `ContentPage` structured_sections, `kb_docs` (howto/problem-analysis)
- Datablocks: product_pain_points taxonomy, faqs mapping to pain points

3) Limited New Year Sale (pricing table)
- Source: pricing rows (Monthly / Annual), discount, exclusive bonuses.
- Dataset target: `PricingPlan`, `Feature` list, `Testimonial` links for trust signals
- Datablocks: pricing/discounts, offer_availability, promotion_timeline

4) Dashboard / Feature list
- Source: Artist Popularity Score, graphs, Meta Ads integration notes, playlist follower tracking.
- Dataset target: `Feature`, `MetricSnapshot` (sample series), `Integration` (Meta, Spotify)
- Datablocks: analytics_metrics (popularity_score, stream_velocity), integrations_status

5) Campaigns / Launch flow
- Source: campaign structure, targeting examples, launch CTA.
- Dataset target: `Campaign`, `MediaAsset` (ad creatives), `UserAccount` (owner)
- Datablocks: campaign_templates, frontload_profiles, targeting_presets

6) Insights / Recommendations
- Source: daily insights, release timing alerts, threshold triggers.
- Dataset target: `MetricSnapshot` (alerts), `KB` entries for recommendations, derived_features (time_to_next_threshold)
- Datablocks: alerts, action_items, scheduling_recommendations

7) Leaderboard & Case Studies
- Source: top growers, ranks, sample ads.
- Dataset target: `LeaderboardEntry`, `Testimonial`, `MediaAsset` (ad examples)
- Datablocks: leaderboard_historical, case_study_refs, ad_examples

8) Pricing / Upsells / Team accounts
- Source: add-on artist accounts pricing, enterprise note.
- Dataset target: `PricingPlan`, `Feature`, `UserAccount` (billing)
- Datablocks: enterprise_pricing, account_limits

9) Testimonials / Wall of Love
- Source: trustpilot reviews, quotes, author names and dates.
- Dataset target: `Testimonial`
- Datablocks: testimonial_sentiment, testimonial_provenance

10) Data Claims / Research Section
- Source: “The Spotify Algorithm Decoded”, dataset sizes, thresholds (10-point milestones).
- Dataset target: `kb_docs` with provenance, `MetricSnapshot` aggregated derived stats
- Datablocks: research_datasets (year,duration,artists_analyzed), algorithm_thresholds

11) FAQ & Support Links
- Source: list of common Qs (connect meta, fans real, pricing, accounts).
- Dataset target: `FAQ`, `kb_docs` cross-linked to `Integration` and `LegalDoc`
- Datablocks: onboarding_faq_flow, integration_guides

12) Footer / Legal
- Source: privacy, tos, refund policy.
- Dataset target: `LegalDoc`
- Datablocks: legal_versions, policy_effective_dates

Recommended sub-branch structure (filesystem / DB schema)
- analytics/
  - metrics_snapshots/ (time-series per entity)
  - derived_features/ (predictions, thresholds)
- product/
  - features/
  - campaign_templates/
- kb/
  - docs/
  - embeddings/
- content/
  - pages/
  - media/
- infra/
  - provenance/
  - schema_version

Provenance & tags for each record
- `source_url`, `source_block` (hero, pricing, testimonials...), `ingested_at`, `confidence` (0.0-1.0), `schema_version`.

Privacy notes
- Mark any emails/PII in `team_members` and `testimonials` (if present) with `pii:true` flag and put behind ACL/encryption.

Next step: finalize mappings into a machine-readable mapping (YAML/JSON) for automated ingestion pipelines.
