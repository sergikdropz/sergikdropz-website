-- Browse aggregates + publish-version helper (fan-safe).
-- Apply via Supabase SQL editor / CLI if MCP apply is unavailable.

CREATE OR REPLACE FUNCTION public.browse_music_artists(
  search text DEFAULT NULL,
  lim int DEFAULT 100,
  off int DEFAULT 0
)
RETURNS TABLE(name text, track_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(t.artist), ''), 'SERGIK') AS name,
    COUNT(*)::bigint AS track_count
  FROM music_library_tracks t
  WHERE (t.is_archived IS NULL OR t.is_archived = false)
    AND (
      search IS NULL
      OR search = ''
      OR COALESCE(NULLIF(TRIM(t.artist), ''), 'SERGIK') ILIKE '%' || search || '%'
    )
  GROUP BY 1
  ORDER BY 1 ASC
  LIMIT GREATEST(lim, 1)
  OFFSET GREATEST(off, 0);
$$;

CREATE OR REPLACE FUNCTION public.browse_music_genres()
RETURNS TABLE(name text, track_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRIM(t.genre) AS name,
    COUNT(*)::bigint AS track_count
  FROM music_library_tracks t
  WHERE (t.is_archived IS NULL OR t.is_archived = false)
    AND t.genre IS NOT NULL
    AND TRIM(t.genre) <> ''
  GROUP BY 1
  ORDER BY track_count DESC, name ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_music_library_publish_version()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(s.value) = 'number' THEN (s.value #>> '{}')::bigint
      WHEN jsonb_typeof(s.value) = 'object' THEN NULLIF(s.value->>'version', '')::bigint
      WHEN jsonb_typeof(s.value) = 'string' THEN NULLIF(s.value #>> '{}', '')::bigint
      ELSE NULL
    END,
    0
  )
  FROM settings s
  WHERE s.key = 'music_library_publish_version'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.browse_music_artists(text, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.browse_music_genres() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_music_library_publish_version() TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_mlt_active_artist
  ON music_library_tracks (artist)
  WHERE is_archived IS NULL OR is_archived = false;

CREATE INDEX IF NOT EXISTS idx_mlt_active_genre
  ON music_library_tracks (genre)
  WHERE (is_archived IS NULL OR is_archived = false) AND genre IS NOT NULL;
