-- Per-track description + compact Sonic DNA snapshot for Release Studio catalog.
ALTER TABLE distribution_tracks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS subgenre TEXT,
  ADD COLUMN IF NOT EXISTS bpm INTEGER,
  ADD COLUMN IF NOT EXISTS key_signature TEXT,
  ADD COLUMN IF NOT EXISTS sonic_snapshot JSONB DEFAULT '{}'::jsonb;
