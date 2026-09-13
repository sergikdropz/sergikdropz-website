-- Supabase Database Schema for SERGIK Website
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PURCHASES TABLE
-- Stores Stripe purchase information
-- ============================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_session_id TEXT UNIQUE NOT NULL,
  track_id TEXT,
  track_title TEXT,
  format TEXT NOT NULL, -- 'WAV', 'FLAC', 'MP3'
  file_url TEXT NOT NULL, -- Supabase Storage URL
  customer_email TEXT,
  customer_name TEXT,
  amount_paid INTEGER, -- Amount in cents
  currency TEXT DEFAULT 'usd',
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_purchases_session_id ON purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer_email ON purchases(customer_email);
CREATE INDEX IF NOT EXISTS idx_purchases_track_id ON purchases(track_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at);

-- ============================================
-- AUDIO FILES TABLE
-- Stores metadata about audio files in Supabase Storage
-- ============================================
CREATE TABLE IF NOT EXISTS audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'SERGIK',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Path in Supabase Storage
  file_url TEXT NOT NULL, -- Full URL to file
  format TEXT NOT NULL, -- 'WAV', 'FLAC', 'MP3', 'M4A'
  size_bytes BIGINT,
  size_mb DECIMAL(10, 2),
  duration_seconds INTEGER,
  folder_path TEXT, -- Original folder structure
  is_purchasable BOOLEAN DEFAULT false,
  price_usd DECIMAL(10, 2),
  artwork_url TEXT,
  metadata JSONB, -- Additional metadata (genre, bpm, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for audio files
CREATE INDEX IF NOT EXISTS idx_audio_files_title ON audio_files(title);
CREATE INDEX IF NOT EXISTS idx_audio_files_artist ON audio_files(artist);
CREATE INDEX IF NOT EXISTS idx_audio_files_format ON audio_files(format);
CREATE INDEX IF NOT EXISTS idx_audio_files_purchasable ON audio_files(is_purchasable);
CREATE INDEX IF NOT EXISTS idx_audio_files_folder_path ON audio_files(folder_path);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_audio_files_updated_at
  BEFORE UPDATE ON audio_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on purchases table
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own purchases (by email)
CREATE POLICY "Users can view own purchases"
  ON purchases
  FOR SELECT
  USING (auth.jwt() ->> 'email' = customer_email);

-- Policy: Service role can do everything (for API routes)
CREATE POLICY "Service role full access"
  ON purchases
  FOR ALL
  USING (auth.role() = 'service_role');

-- Enable RLS on audio_files table
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view audio files (public catalog)
CREATE POLICY "Public can view audio files"
  ON audio_files
  FOR SELECT
  USING (true);

-- Policy: Service role can do everything
CREATE POLICY "Service role full access audio"
  ON audio_files
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE purchases IS 'Stores Stripe purchase records for audio file downloads';
COMMENT ON TABLE audio_files IS 'Metadata for audio files stored in Supabase Storage';
COMMENT ON COLUMN purchases.download_count IS 'Number of times the file has been downloaded';
COMMENT ON COLUMN audio_files.metadata IS 'JSON object with additional track metadata (genre, bpm, key, etc.)';

-- ============================================
-- AUDIO ANALYSIS EXTENSIONS
-- ============================================

-- Waveform and audio analysis columns
ALTER TABLE audio_files 
ADD COLUMN IF NOT EXISTS waveform_data JSONB,
ADD COLUMN IF NOT EXISTS waveform_samples INTEGER DEFAULT 2000,
ADD COLUMN IF NOT EXISTS waveform_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS analysis_error TEXT,
ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS bpm INTEGER,
ADD COLUMN IF NOT EXISTS original_bpm INTEGER, -- Original tempo before any adjustments
ADD COLUMN IF NOT EXISTS key_signature TEXT,
ADD COLUMN IF NOT EXISTS energy_level DECIMAL(3, 2),
ADD COLUMN IF NOT EXISTS danceability DECIMAL(3, 2),
ADD COLUMN IF NOT EXISTS frequency_bands JSONB,
ADD COLUMN IF NOT EXISTS transient_points JSONB,
ADD COLUMN IF NOT EXISTS loudness_range DECIMAL(5, 2);

-- Sonic DNA columns
ALTER TABLE audio_files 
ADD COLUMN IF NOT EXISTS sonic_dna JSONB,
ADD COLUMN IF NOT EXISTS musicbrainz_id TEXT,
ADD COLUMN IF NOT EXISTS musicbrainz_data JSONB,
ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
ADD COLUMN IF NOT EXISTS sonic_dna_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS sonic_dna_analyzed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sonic_dna_error TEXT;

-- Indexes for audio analysis
CREATE INDEX IF NOT EXISTS idx_audio_files_analysis_status ON audio_files(analysis_status);
CREATE INDEX IF NOT EXISTS idx_audio_files_waveform ON audio_files USING GIN (waveform_data);
CREATE INDEX IF NOT EXISTS idx_audio_files_sonic_dna_status ON audio_files(sonic_dna_status);
CREATE INDEX IF NOT EXISTS idx_audio_files_musicbrainz_id ON audio_files(musicbrainz_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_bpm ON audio_files(bpm);
CREATE INDEX IF NOT EXISTS idx_audio_files_original_bpm ON audio_files(original_bpm);

-- Comments for new columns
COMMENT ON COLUMN audio_files.waveform_data IS 'Pre-computed waveform peak data array for instant visualization';
COMMENT ON COLUMN audio_files.analysis_status IS 'Status of audio analysis: pending, processing, completed, failed';
COMMENT ON COLUMN audio_files.bpm IS 'Current BPM (can be manually edited)';
COMMENT ON COLUMN audio_files.original_bpm IS 'Original detected BPM before any manual adjustments';
COMMENT ON COLUMN audio_files.sonic_dna IS 'Complete Sonic DNA analysis including emotional, musical, historical, and regional intelligence';
COMMENT ON COLUMN audio_files.musicbrainz_id IS 'MusicBrainz artist/release ID for metadata lookup';
COMMENT ON COLUMN audio_files.musicbrainz_data IS 'Cached MusicBrainz metadata (genres, regions, tags)';
COMMENT ON COLUMN audio_files.ai_analysis IS 'AI-generated analysis combining audio features and MusicBrainz data';

-- ============================================
-- INSTAGRAM MEDIA TABLE
-- Stores scraped Instagram post metadata
-- ============================================
CREATE TABLE IF NOT EXISTS instagram_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_url TEXT UNIQUE NOT NULL,
  permalink TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  video_url TEXT,
  caption TEXT,
  username TEXT,
  post_id TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_instagram_media_post_url ON instagram_media(post_url);
CREATE INDEX IF NOT EXISTS idx_instagram_media_username ON instagram_media(username);
CREATE INDEX IF NOT EXISTS idx_instagram_media_type ON instagram_media(media_type);
CREATE INDEX IF NOT EXISTS idx_instagram_media_active ON instagram_media(is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_media_scraped_at ON instagram_media(scraped_at DESC);

CREATE OR REPLACE FUNCTION update_instagram_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_instagram_media_updated_at
  BEFORE UPDATE ON instagram_media
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_media_updated_at();

