-- Interim distributor until Revelator Partner API credentials exist.
ALTER TABLE distribution_releases DROP CONSTRAINT IF EXISTS distribution_releases_distribution_mode_check;
ALTER TABLE distribution_releases
  ADD CONSTRAINT distribution_releases_distribution_mode_check
  CHECK (distribution_mode IN ('self', 'aggregator', 'distrokid'));
