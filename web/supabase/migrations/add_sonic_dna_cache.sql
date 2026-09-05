-- Fast Sonic DNA lookup table used by library publish + /api/audio/sonic-dna.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS sonic_dna_cache (
  track_id TEXT PRIMARY KEY,
  audio_file_id TEXT,
  sonic_dna JSONB NOT NULL DEFAULT '{}'::jsonb,
  bpm NUMERIC,
  key_signature TEXT,
  energy_level NUMERIC,
  danceability NUMERIC,
  genres TEXT[] DEFAULT '{}'::text[],
  primary_genre TEXT,
  subgenre TEXT,
  drum_style TEXT,
  time_signature TEXT,
  key TEXT,
  scale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sonic_dna_cache_track_audio
  ON sonic_dna_cache(track_id, audio_file_id);

CREATE INDEX IF NOT EXISTS idx_sonic_dna_cache_audio_file_id
  ON sonic_dna_cache(audio_file_id)
  WHERE audio_file_id IS NOT NULL;

ALTER TABLE sonic_dna_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sonic_dna_cache_service_all ON sonic_dna_cache;
CREATE POLICY sonic_dna_cache_service_all
  ON sonic_dna_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS sonic_dna_cache_read ON sonic_dna_cache;
CREATE POLICY sonic_dna_cache_read
  ON sonic_dna_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
