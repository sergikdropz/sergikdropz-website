CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_session_id TEXT UNIQUE NOT NULL,
  track_id TEXT,
  track_title TEXT,
  format TEXT NOT NULL,
  file_url TEXT NOT NULL,
  customer_email TEXT,
  customer_name TEXT,
  amount_paid INTEGER,
  currency TEXT DEFAULT 'usd',
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'SERGIK',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  format TEXT NOT NULL,
  size_bytes BIGINT,
  size_mb DECIMAL(10, 2),
  duration_seconds INTEGER,
  folder_path TEXT,
  is_purchasable BOOLEAN DEFAULT false,
  price_usd DECIMAL(10, 2),
  artwork_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  waveform_data JSONB,
  waveform_samples INTEGER DEFAULT 2000,
  waveform_version INTEGER DEFAULT 1,
  analysis_status TEXT DEFAULT 'pending',
  analysis_error TEXT,
  analyzed_at TIMESTAMPTZ,
  bpm INTEGER,
  original_bpm INTEGER,
  key_signature TEXT,
  energy_level DECIMAL(5, 2),
  danceability DECIMAL(5, 2),
  frequency_bands JSONB,
  transient_points JSONB,
  loudness_range DECIMAL(5, 2),
  sonic_dna JSONB,
  musicbrainz_id TEXT,
  musicbrainz_data JSONB,
  ai_analysis JSONB,
  sonic_dna_status TEXT DEFAULT 'pending',
  sonic_dna_analyzed_at TIMESTAMPTZ,
  sonic_dna_error TEXT,
  waveform_json_url TEXT,
  waveform_svg_url TEXT,
  sonic_dna_json_url TEXT
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  image_id TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  src TEXT NOT NULL,
  alt TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  storage_url TEXT,
  storage_path TEXT,
  is_stored_in_supabase BOOLEAN DEFAULT false,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  mime_type TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS music_library_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id TEXT REFERENCES music_library_folders(id) ON DELETE CASCADE,
  hidden BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  artwork_url TEXT,
  year INTEGER,
  album_artist TEXT,
  is_compilation BOOLEAN DEFAULT false,
  genre TEXT,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
  energy_level DECIMAL(5, 2),
  danceability DECIMAL(5, 2),
  created_at TIMESTAMPTZ,
  date TEXT,
  date_created DATE,
  year INTEGER,
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  display_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at_timestamp TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  genre TEXT,
  subgenre TEXT,
  track_number INTEGER,
  disc_number INTEGER,
  rating INTEGER,
  play_count INTEGER DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  tags TEXT[],
  sort_artist TEXT
);

-- Hot-path indexes (folder browse, audio link, vault filters)
CREATE INDEX IF NOT EXISTS idx_ml_tracks_folder_id ON music_library_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_audio_file_id ON music_library_tracks(audio_file_id);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_folder_display ON music_library_tracks(folder_id, display_order, title);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_archived ON music_library_tracks(is_archived) WHERE is_archived IS DISTINCT FROM true;
CREATE INDEX IF NOT EXISTS idx_ml_tracks_genre ON music_library_tracks(genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_tracks_artist ON music_library_tracks(artist);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_sort_artist ON music_library_tracks(sort_artist);
CREATE INDEX IF NOT EXISTS idx_ml_folders_type_hidden ON music_library_folders(type) WHERE hidden IS DISTINCT FROM true AND is_archived IS DISTINCT FROM true;
CREATE INDEX IF NOT EXISTS idx_audio_files_file_path ON audio_files(file_path);
CREATE INDEX IF NOT EXISTS idx_audio_files_file_name ON audio_files(file_name);
CREATE INDEX IF NOT EXISTS idx_audio_files_folder_path ON audio_files(folder_path);

CREATE TABLE IF NOT EXISTS music_library_playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  track_ids TEXT[] DEFAULT '{}',
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_url TEXT UNIQUE NOT NULL,
  permalink TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  video_url TEXT,
  caption TEXT,
  username TEXT,
  post_id TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS fan_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  source TEXT,
  campaign TEXT,
  first_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  last_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  linked_user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fan_leads_created_at ON fan_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_leads_linked_user ON fan_leads(linked_user_id);

DROP TRIGGER IF EXISTS update_audio_files_updated_at ON audio_files;
CREATE TRIGGER update_audio_files_updated_at
  BEFORE UPDATE ON audio_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

INSERT INTO settings (key, value)
VALUES ('homepage_instagram_feed_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
