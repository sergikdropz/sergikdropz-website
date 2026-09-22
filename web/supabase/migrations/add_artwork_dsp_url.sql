-- DSP-ready cover art (separate from site artwork_url — do not downscale marketing art in place)
ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS artwork_dsp_url TEXT;

COMMENT ON COLUMN distribution_releases.artwork_dsp_url IS
  'Release-ready cover for aggregator/DSP delivery (typically 1400–3000px square JPEG under 10MB). Site/marketing continues to use artwork_url.';
