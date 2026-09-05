-- Music Library Management Schema
-- Run this in Supabase SQL Editor to enable backend control of music library structure

-- ============================================
-- MUSIC LIBRARY FOLDERS TABLE
-- Stores the hierarchical folder structure
-- ============================================
CREATE TABLE IF NOT EXISTS music_library_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('folder', 'album', 'ep', 'single', 'remix', 'track')),
  parent_id TEXT REFERENCES music_library_folders(id) ON DELETE CASCADE,
  hidden BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  artwork_url TEXT,
  year INTEGER,
  album_artist TEXT,
  is_compilation BOOLEAN DEFAULT false,
  genre TEXT,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_music_library_folders_parent_id ON music_library_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_music_library_folders_type ON music_library_folders(type);
CREATE INDEX IF NOT EXISTS idx_music_library_folders_hidden ON music_library_folders(hidden);
CREATE INDEX IF NOT EXISTS idx_music_library_folders_archived ON music_library_folders(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_folders_display_order ON music_library_folders(display_order);

-- ============================================
-- MUSIC LIBRARY TRACKS TABLE
-- Links tracks to folders in the library structure
-- ============================================
CREATE TABLE IF NOT EXISTS music_library_tracks (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES music_library_folders(id) ON DELETE CASCADE,
  audio_file_id UUID REFERENCES audio_files(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'SERGIK',
  duration INTEGER,
  file_url TEXT NOT NULL,
  artwork_url TEXT,
  bpm INTEGER,
  key_signature TEXT,
  sonic_dna JSONB,
  waveform JSONB,
  energy_level DECIMAL(3, 1),
  danceability DECIMAL(3, 1),
  created_at TIMESTAMP WITH TIME ZONE,
  date TEXT,
  date_created DATE,
  year INTEGER,
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_folder_id ON music_library_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_audio_file_id ON music_library_tracks(audio_file_id);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_title ON music_library_tracks(title);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_artist ON music_library_tracks(artist);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_archived ON music_library_tracks(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_display_order ON music_library_tracks(display_order);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_date_created ON music_library_tracks(date_created);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp for folders
CREATE OR REPLACE FUNCTION update_music_library_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update updated_at timestamp for tracks
CREATE OR REPLACE FUNCTION update_music_library_tracks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_music_library_folders_updated_at
  BEFORE UPDATE ON music_library_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_music_library_folders_updated_at();

CREATE TRIGGER update_music_library_tracks_updated_at
  BEFORE UPDATE ON music_library_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_music_library_tracks_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on folders table
ALTER TABLE music_library_folders ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access (everyone can view non-hidden folders)
CREATE POLICY "Public can view non-hidden folders"
  ON music_library_folders
  FOR SELECT
  USING (hidden = false);

-- Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role full access to folders"
  ON music_library_folders
  FOR ALL
  USING (auth.role() = 'service_role');

-- Enable RLS on tracks table
ALTER TABLE music_library_tracks ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access
CREATE POLICY "Public can view tracks"
  ON music_library_tracks
  FOR SELECT
  USING (true);

-- Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role full access to tracks"
  ON music_library_tracks
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- MUSIC LIBRARY PLAYLISTS TABLE
-- Stores user-created playlists
-- ============================================
CREATE TABLE IF NOT EXISTS music_library_playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  track_ids TEXT[] DEFAULT '{}',
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_music_library_playlists_name ON music_library_playlists(name);
CREATE INDEX IF NOT EXISTS idx_music_library_playlists_created_at ON music_library_playlists(created_at);
CREATE INDEX IF NOT EXISTS idx_music_library_playlists_archived ON music_library_playlists(is_archived);

-- Function to update updated_at timestamp for playlists
CREATE OR REPLACE FUNCTION update_music_library_playlists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_music_library_playlists_updated_at
  BEFORE UPDATE ON music_library_playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_music_library_playlists_updated_at();

-- Enable RLS on playlists table
ALTER TABLE music_library_playlists ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access
CREATE POLICY "Public can view playlists"
  ON music_library_playlists
  FOR SELECT
  USING (true);

-- Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role full access to playlists"
  ON music_library_playlists
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- HELPER VIEWS
-- ============================================

-- View for folder hierarchy with child counts
CREATE OR REPLACE VIEW music_library_folders_with_counts AS
SELECT 
  f.*,
  COUNT(DISTINCT c.id) FILTER (WHERE c.hidden = false AND c.is_archived = false) as child_folder_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.is_archived = false) as track_count
FROM music_library_folders f
LEFT JOIN music_library_folders c ON c.parent_id = f.id
LEFT JOIN music_library_tracks t ON t.folder_id = f.id
WHERE f.hidden = false AND f.is_archived = false
GROUP BY f.id;
