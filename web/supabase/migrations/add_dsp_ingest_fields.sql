-- DSP ingest fields required by stores (cover, AI, previously released, attestations, artist IDs).
ALTER TABLE distribution_tracks
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS cover_original_title TEXT,
  ADD COLUMN IF NOT EXISTS cover_original_artist TEXT,
  ADD COLUMN IF NOT EXISTS writer_legal_names TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN,
  ADD COLUMN IF NOT EXISTS radio_edit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paired_explicit_isrc TEXT,
  ADD COLUMN IF NOT EXISTS preview_start_seconds INTEGER;

ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS previously_released BOOLEAN,
  ADD COLUMN IF NOT EXISTS previous_isrc TEXT,
  ADD COLUMN IF NOT EXISTS previous_upc TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS youtube_artist_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT,
  ADD COLUMN IF NOT EXISTS ingest_attestations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS artwork_owned BOOLEAN DEFAULT false;
