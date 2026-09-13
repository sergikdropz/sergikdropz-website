-- Release Studio: self-distribution, marketing copy, DSP targets
ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS distribution_mode TEXT DEFAULT 'self'
    CHECK (distribution_mode IN ('self', 'aggregator'));

ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS target_stores JSONB DEFAULT '[]'::jsonb;

ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS marketing_copy JSONB DEFAULT '{}'::jsonb;
