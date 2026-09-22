-- DSP-complete package fields for Release Studio.

ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS album_artist TEXT,
  ADD COLUMN IF NOT EXISTS catalog_number TEXT,
  ADD COLUMN IF NOT EXISTS original_release_date DATE,
  ADD COLUMN IF NOT EXISTS p_line_year INTEGER,
  ADD COLUMN IF NOT EXISTS c_line_year INTEGER,
  ADD COLUMN IF NOT EXISTS spotify_artist_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_artist_id TEXT;

UPDATE distribution_releases
SET album_artist = label_name
WHERE album_artist IS NULL
  AND label_name IS NOT NULL
  AND btrim(label_name) <> '';

ALTER TABLE distribution_tracks
  ADD COLUMN IF NOT EXISTS track_number INTEGER,
  ADD COLUMN IF NOT EXISTS instrumental BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS iswc TEXT,
  ADD COLUMN IF NOT EXISTS publisher_name TEXT,
  ADD COLUMN IF NOT EXISTS publisher_ipi TEXT;

ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS publisher_name TEXT,
  ADD COLUMN IF NOT EXISTS publisher_ipi TEXT,
  ADD COLUMN IF NOT EXISTS writer_ipi TEXT;
