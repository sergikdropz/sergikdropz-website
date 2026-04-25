-- iTunes-Style Music Library Enhancement Migration
-- Promotes metadata into first-class columns for fast filtering, sorting, and browse views
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. PROMOTE METADATA TO REAL COLUMNS ON music_library_tracks
-- ============================================
ALTER TABLE music_library_tracks
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS subgenre TEXT,
  ADD COLUMN IF NOT EXISTS track_number INTEGER,
  ADD COLUMN IF NOT EXISTS disc_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS composer TEXT,
  ADD COLUMN IF NOT EXISTS rating SMALLINT DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comments TEXT,
  ADD COLUMN IF NOT EXISTS sort_artist TEXT;

-- ============================================
-- 2. ADD ALBUM-LEVEL METADATA TO music_library_folders
-- ============================================
ALTER TABLE music_library_folders
  ADD COLUMN IF NOT EXISTS album_artist TEXT,
  ADD COLUMN IF NOT EXISTS is_compilation BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS genre TEXT;

-- ============================================
-- 3. INDEXES FOR NEW BROWSE DIMENSIONS
-- ============================================
CREATE INDEX IF NOT EXISTS idx_mlt_genre ON music_library_tracks(genre);
CREATE INDEX IF NOT EXISTS idx_mlt_subgenre ON music_library_tracks(subgenre);
CREATE INDEX IF NOT EXISTS idx_mlt_rating ON music_library_tracks(rating);
CREATE INDEX IF NOT EXISTS idx_mlt_play_count ON music_library_tracks(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_mlt_last_played ON music_library_tracks(last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_mlt_track_number ON music_library_tracks(disc_number, track_number);
CREATE INDEX IF NOT EXISTS idx_mlt_tags ON music_library_tracks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_mlt_sort_artist ON music_library_tracks(sort_artist);
CREATE INDEX IF NOT EXISTS idx_mlf_album_artist ON music_library_folders(album_artist);
CREATE INDEX IF NOT EXISTS idx_mlf_genre ON music_library_folders(genre);

-- ============================================
-- 4. TRACK PLAYS TABLE (listening history)
-- ============================================
CREATE TABLE IF NOT EXISTS track_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id TEXT REFERENCES music_library_tracks(id) ON DELETE CASCADE,
  fan_id UUID,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duration_listened INTEGER,
  source TEXT DEFAULT 'library',
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_track_plays_track_id ON track_plays(track_id);
CREATE INDEX IF NOT EXISTS idx_track_plays_fan_id ON track_plays(fan_id);
CREATE INDEX IF NOT EXISTS idx_track_plays_played_at ON track_plays(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_plays_source ON track_plays(source);

ALTER TABLE track_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to track_plays"
  ON track_plays FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Fans can view own plays"
  ON track_plays FOR SELECT
  USING (fan_id = auth.uid());

-- ============================================
-- 5. SMART PLAYLISTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS smart_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  rules JSONB NOT NULL DEFAULT '{}',
  sort_by TEXT DEFAULT 'created_at',
  sort_dir TEXT DEFAULT 'desc',
  max_tracks INTEGER,
  is_live BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  owner_type TEXT DEFAULT 'admin' CHECK (owner_type IN ('admin', 'fan')),
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_playlists_owner ON smart_playlists(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_smart_playlists_system ON smart_playlists(is_system);

ALTER TABLE smart_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to smart_playlists"
  ON smart_playlists FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public can view admin smart playlists"
  ON smart_playlists FOR SELECT
  USING (owner_type = 'admin');

CREATE POLICY "Fans can manage own smart playlists"
  ON smart_playlists FOR ALL
  USING (owner_type = 'fan' AND owner_id = auth.uid())
  WITH CHECK (owner_type = 'fan' AND owner_id = auth.uid());

-- ============================================
-- 6. AUTO-UPDATE updated_at TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_smart_playlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_smart_playlists_updated_at
  BEFORE UPDATE ON smart_playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_smart_playlists_updated_at();

-- ============================================
-- 7. HELPER FUNCTION: Increment play count
-- ============================================
CREATE OR REPLACE FUNCTION record_track_play(
  p_track_id TEXT,
  p_fan_id UUID DEFAULT NULL,
  p_duration INTEGER DEFAULT NULL,
  p_source TEXT DEFAULT 'library'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO track_plays (track_id, fan_id, duration_listened, source)
  VALUES (p_track_id, p_fan_id, p_duration, p_source);

  UPDATE music_library_tracks
  SET play_count = COALESCE(play_count, 0) + 1,
      last_played_at = NOW()
  WHERE id = p_track_id;
END;
$$;

-- ============================================
-- 8. SEED SYSTEM SMART PLAYLISTS
-- ============================================
INSERT INTO smart_playlists (name, description, rules, sort_by, sort_dir, max_tracks, is_system, owner_type)
VALUES
  ('Recently Played', 'Tracks you listened to recently', '{"type":"recently_played"}', 'last_played_at', 'desc', 50, true, 'admin'),
  ('Most Played', 'Your top tracks by play count', '{"type":"most_played","min_plays":1}', 'play_count', 'desc', 25, true, 'admin'),
  ('Recently Added', 'Newest additions to the library', '{"type":"recently_added"}', 'created_at_timestamp', 'desc', 50, true, 'admin'),
  ('Top Rated', 'Highest rated tracks', '{"type":"top_rated","min_rating":4}', 'rating', 'desc', 50, true, 'admin'),
  ('High Energy', 'Tracks with energy level 7+', '{"energy_min":0.7}', 'energy_level', 'desc', null, true, 'admin'),
  ('Chill Vibes', 'Low energy, smooth tracks', '{"energy_max":0.4}', 'energy_level', 'asc', null, true, 'admin')
ON CONFLICT DO NOTHING;

-- ============================================
-- 9. ARTIST BROWSE VIEW
-- ============================================
CREATE OR REPLACE VIEW artist_discography AS
SELECT
  COALESCE(f.album_artist, t_artist.artist, 'SERGIK') AS artist_name,
  f.id AS folder_id,
  f.name AS album_name,
  f.type AS release_type,
  f.artwork_url,
  f.year,
  f.genre AS album_genre,
  COUNT(DISTINCT t_artist.id) AS track_count,
  SUM(t_artist.duration) AS total_duration
FROM music_library_folders f
LEFT JOIN music_library_tracks t_artist ON t_artist.folder_id = f.id AND (t_artist.is_archived IS NULL OR t_artist.is_archived = false)
WHERE f.is_archived = false AND f.hidden = false
GROUP BY f.id, t_artist.artist
ORDER BY artist_name, f.year DESC NULLS LAST;
