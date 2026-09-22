-- DSP live verification: distinguish saved URLs from proven live release pages.
ALTER TABLE distribution_store_links
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_detail TEXT;

COMMENT ON COLUMN distribution_store_links.verification_status IS
  'unverified | live | reachable | artist_only | b2b | failed';
COMMENT ON COLUMN distribution_store_links.verification_detail IS
  'Short reason: isrc_match, http_404, artist_profile, etc.';
COMMENT ON COLUMN distribution_store_links.verified_at IS
  'Set only when verification_status is live or reachable — not on blind insert.';
