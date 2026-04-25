-- Optimized view for fast track queries
-- This view pre-joins commonly accessed data and includes only essential fields
CREATE OR REPLACE VIEW track_summary AS
SELECT
  t.id,
  t.folder_id,
  t.audio_file_id,
  t.title,
  t.artist,
  t.duration,
  t.file_url,
  t.artwork_url,
  t.created_at,
  t.display_order,

  -- Audio analysis fields (from audio_files)
  COALESCE(t.bpm, af.bpm) as bpm,
  COALESCE(t.key_signature, af.key_signature) as key_signature,
  COALESCE(t.energy_level, af.energy_level) as energy_level,
  COALESCE(t.danceability, af.danceability) as danceability,

  -- Pre-computed sonic DNA summary (extract key fields for fast queries)
  CASE
    WHEN af.sonic_dna IS NOT NULL THEN
      jsonb_build_object(
        'hasData', true,
        'genre', COALESCE(
          af.sonic_dna->'genres'->>'primaryGenres',
          af.sonic_dna->'comprehensive'->'genres'->>'primary',
          af.sonic_dna->'genres'->>'primary',
          af.sonic_dna->>'genre'
        ),
        'key', COALESCE(
          af.sonic_dna->'harmony'->>'keySignature',
          af.sonic_dna->'technical'->'key'->>'key'
        ),
        'bpm', COALESCE(
          af.sonic_dna->'technical'->>'bpm',
          af.bpm
        )
      )
    ELSE NULL
  END as sonic_dna_summary,

  -- Metadata for sorting and filtering
  af.duration_seconds,
  af.file_size,
  af.created_at as audio_created_at

FROM music_library_tracks t
LEFT JOIN audio_files af ON t.audio_file_id = af.id
WHERE t.hidden = false OR t.hidden IS NULL;

-- Create indexes for the view (these will actually index the underlying tables)
CREATE INDEX IF NOT EXISTS idx_track_summary_folder ON music_library_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_track_summary_bpm ON music_library_tracks(bpm);
CREATE INDEX IF NOT EXISTS idx_track_summary_key ON music_library_tracks(key_signature);
CREATE INDEX IF NOT EXISTS idx_track_summary_created ON music_library_tracks(created_at);
CREATE INDEX IF NOT EXISTS idx_track_summary_title_artist ON music_library_tracks(title, artist);

-- Index on audio_files for the join
CREATE INDEX IF NOT EXISTS idx_audio_files_track_join ON audio_files(id, bpm, key_signature, energy_level, danceability, duration_seconds);

-- Partial index for tracks with sonic DNA (smaller, faster index)
CREATE INDEX IF NOT EXISTS idx_audio_files_sonic_dna_exists ON audio_files(id)
WHERE sonic_dna IS NOT NULL;

-- Materialized view for even faster queries (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS track_summary_mat AS
SELECT * FROM track_summary;

-- Index the materialized view
CREATE INDEX IF NOT EXISTS idx_track_summary_mat_folder ON track_summary_mat(folder_id);
CREATE INDEX IF NOT EXISTS idx_track_summary_mat_bpm ON track_summary_mat(bpm);
CREATE INDEX IF NOT EXISTS idx_track_summary_mat_genre ON track_summary_mat((sonic_dna_summary->>'genre'));
CREATE INDEX IF NOT EXISTS idx_track_summary_mat_key ON track_summary_mat((sonic_dna_summary->>'key'));

-- Function to refresh the materialized view (call periodically or on data changes)
CREATE OR REPLACE FUNCTION refresh_track_summary_mat()
RETURNS void
LANGUAGE sql
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY track_summary_mat;
$$;