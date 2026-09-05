-- Permanent per-track created date (file/export day). Survives metadata rebuilds/sync.
ALTER TABLE public.music_library_tracks
  ADD COLUMN IF NOT EXISTS date_created DATE;

CREATE INDEX IF NOT EXISTS idx_music_library_tracks_date_created
  ON public.music_library_tracks (date_created);

-- Backfill from metadata.original_date when present.
UPDATE public.music_library_tracks
SET date_created = substring(metadata->>'original_date' from 1 for 10)::date
WHERE date_created IS NULL
  AND metadata->>'original_date' ~ '^\d{4}-\d{2}-\d{2}';

-- Keep metadata.original_date in sync with the column (UI fallback).
UPDATE public.music_library_tracks
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{original_date}',
  to_jsonb(to_char(date_created, 'YYYY-MM-DD'))
)
WHERE date_created IS NOT NULL
  AND (
    metadata->>'original_date' IS NULL
    OR metadata->>'original_date' = ''
  );
