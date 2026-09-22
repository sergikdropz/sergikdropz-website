-- Social / Meta promo schedule for Release Studio marketing pipeline.
ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS social_promo JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN distribution_releases.social_promo IS
  'IG/Meta promo calendar: posts[], street_date, timezone (see web/lib/studio/social-promo.ts)';
