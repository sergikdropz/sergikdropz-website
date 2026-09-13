-- Restore waveform + sonic DNA onto duplicate audio_files and library tracks.
-- Safe to re-run. Init-time ALTER is also applied by restore-analysis.mjs on live volumes.

ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS waveform_json_url TEXT;
ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS waveform_svg_url TEXT;
ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS sonic_dna_json_url TEXT;

CREATE OR REPLACE FUNCTION sergik_norm_audio_path(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN '';
  END IF;
  s := btrim(p);
  s := regexp_replace(s, '[?#].*$', '');
  s := replace(s, '%20', ' ');
  s := replace(s, '%3A', ':');
  s := replace(s, '%3a', ':');
  s := replace(s, '%2F', '/');
  s := regexp_replace(s, '^https?://[^/]+/storage/v1/object/public/audio-files/', '', 'i');
  s := regexp_replace(s, '^/?public/audio/', '', 'i');
  s := regexp_replace(s, '^/?audio/', '', 'i');
  s := replace(s, E'\\', '/');
  s := regexp_replace(s, '^/+', '');
  s := lower(s);
  s := regexp_replace(s, '\.(mp3|wav|aiff|flac|m4a)$', '');
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION sergik_basename_stem(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(sergik_norm_audio_path(p), '^.*/', '');
$$;

-- Copy analysis onto duplicate rows that were seeded without DNA/waveforms.
UPDATE audio_files m
SET
  waveform_data = COALESCE(m.waveform_data, s.waveform_data),
  waveform_samples = COALESCE(m.waveform_samples, s.waveform_samples),
  waveform_version = COALESCE(m.waveform_version, s.waveform_version),
  sonic_dna = COALESCE(m.sonic_dna, s.sonic_dna),
  sonic_dna_status = CASE
    WHEN COALESCE(m.sonic_dna, s.sonic_dna) ? 'genres' THEN 'completed'
    ELSE COALESCE(m.sonic_dna_status, s.sonic_dna_status)
  END,
  sonic_dna_analyzed_at = COALESCE(m.sonic_dna_analyzed_at, s.sonic_dna_analyzed_at, NOW()),
  sonic_dna_error = CASE
    WHEN COALESCE(m.sonic_dna, s.sonic_dna) ? 'genres' THEN NULL
    ELSE m.sonic_dna_error
  END,
  bpm = COALESCE(m.bpm, s.bpm),
  original_bpm = COALESCE(m.original_bpm, s.original_bpm),
  key_signature = COALESCE(NULLIF(m.key_signature, 'Unknown'), NULLIF(s.key_signature, 'Unknown'), m.key_signature),
  energy_level = COALESCE(m.energy_level, s.energy_level),
  danceability = COALESCE(m.danceability, s.danceability),
  frequency_bands = COALESCE(m.frequency_bands, s.frequency_bands),
  analysis_status = CASE
    WHEN COALESCE(m.waveform_data, s.waveform_data) IS NOT NULL THEN 'completed'
    ELSE m.analysis_status
  END,
  analyzed_at = COALESCE(m.analyzed_at, s.analyzed_at, NOW())
FROM (
  SELECT DISTINCT ON (sergik_basename_stem(file_name))
    *
  FROM audio_files
  WHERE sonic_dna ? 'genres'
  ORDER BY
    sergik_basename_stem(file_name),
    (sonic_dna_status = 'completed') DESC,
    updated_at DESC NULLS LAST
) s
WHERE sergik_basename_stem(m.file_name) = sergik_basename_stem(s.file_name)
  AND (
    m.sonic_dna IS NULL
    OR m.waveform_data IS NULL
  );

-- Treat stored DNA as complete even if an old agent run marked the row failed.
UPDATE audio_files
SET
  sonic_dna_status = 'completed',
  sonic_dna_error = NULL,
  sonic_dna_analyzed_at = COALESCE(sonic_dna_analyzed_at, analyzed_at, NOW()),
  analysis_status = CASE WHEN waveform_data IS NOT NULL THEN 'completed' ELSE analysis_status END
WHERE sonic_dna ? 'genres'
  AND COALESCE(sonic_dna_status, '') IS DISTINCT FROM 'completed';

-- Link library tracks to audio_files (path stem, then unique basename, then unique title).
WITH matched AS (
  SELECT DISTINCT ON (t.id)
    t.id AS track_id,
    a.id AS audio_id
  FROM music_library_tracks t
  JOIN audio_files a
    ON sergik_norm_audio_path(t.file_url) IN (
      sergik_norm_audio_path(a.file_path),
      sergik_norm_audio_path(a.file_url)
    )
  ORDER BY t.id,
    (sergik_norm_audio_path(t.file_url) = sergik_norm_audio_path(a.file_path)) DESC,
    (a.sonic_dna IS NOT NULL) DESC
)
UPDATE music_library_tracks t
SET audio_file_id = m.audio_id
FROM matched m
WHERE t.id = m.track_id
  AND t.audio_file_id IS DISTINCT FROM m.audio_id;

WITH unique_stems AS (
  SELECT sergik_basename_stem(file_name) AS stem, (array_agg(id))[1] AS audio_id
  FROM audio_files
  GROUP BY 1
  HAVING count(*) = 1
)
UPDATE music_library_tracks t
SET audio_file_id = u.audio_id
FROM unique_stems u
WHERE t.audio_file_id IS NULL
  AND sergik_basename_stem(t.file_url) = u.stem;

WITH unique_titles AS (
  SELECT lower(btrim(title)) AS title_key, (array_agg(id))[1] AS audio_id
  FROM audio_files
  GROUP BY 1
  HAVING count(*) = 1
)
UPDATE music_library_tracks t
SET audio_file_id = u.audio_id
FROM unique_titles u
WHERE t.audio_file_id IS NULL
  AND lower(btrim(t.title)) = u.title_key;

-- Copy restored analysis onto every linked library row.
UPDATE music_library_tracks t
SET
  sonic_dna = COALESCE(a.sonic_dna, t.sonic_dna),
  waveform = COALESCE(a.waveform_data, t.waveform),
  bpm = COALESCE(a.bpm, t.bpm),
  key_signature = COALESCE(NULLIF(a.key_signature, 'Unknown'), NULLIF(t.key_signature, 'Unknown'), t.key_signature),
  energy_level = COALESCE(a.energy_level, t.energy_level),
  danceability = COALESCE(a.danceability, t.danceability),
  duration = COALESCE(t.duration, a.duration_seconds),
  metadata = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'has_sonic_dna', (COALESCE(a.sonic_dna, t.sonic_dna) ? 'genres'),
    'has_waveform', (COALESCE(a.waveform_data, t.waveform) IS NOT NULL),
    'has_bpm', (COALESCE(a.bpm, t.bpm) IS NOT NULL),
    'is_linked', true,
    'analysis_restored_at', NOW()
  )
FROM audio_files a
WHERE t.audio_file_id = a.id;
