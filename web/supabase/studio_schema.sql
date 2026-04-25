-- Studio Distribution Schema
-- Run this in Supabase SQL Editor to enable distribution workflow

-- ============================================
-- ISRC COUNTERS TABLE
-- Tracks ISRC serial numbers per year/prefix
-- ============================================
CREATE TABLE IF NOT EXISTS isrc_counters (
  prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  next_serial INTEGER DEFAULT 1,
  PRIMARY KEY (prefix, year)
);

-- ============================================
-- DISTRIBUTION RELEASES TABLE
-- Stores release metadata for distribution
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_releases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'ep', 'album')),
  release_date DATE,
  upc TEXT,
  distributor_release_id TEXT,
  distributor_status TEXT DEFAULT 'draft' CHECK (distributor_status IN ('draft', 'submitted', 'delivered', 'live', 'error')),
  artwork_url TEXT,
  description TEXT,
  explicit BOOLEAN DEFAULT false,
  genre TEXT,
  subgenre TEXT,
  label_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DISTRIBUTION TRACKS TABLE
-- Links tracks to releases with ISRC and metadata
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_tracks (
  id TEXT PRIMARY KEY,
  release_id TEXT REFERENCES distribution_releases(id) ON DELETE CASCADE,
  music_library_track_id TEXT REFERENCES music_library_tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  version TEXT, -- original, remix, edit, etc.
  duration INTEGER,
  wav_url TEXT NOT NULL,
  artwork_url TEXT,
  isrc_prefix TEXT,
  isrc_year INTEGER,
  isrc_serial INTEGER,
  isrc_full TEXT UNIQUE, -- Full ISRC: PREFIX + YY + SERIAL
  fingerprint_hash TEXT, -- For duplicate detection
  contributors JSONB DEFAULT '[]'::jsonb, -- [{role: "producer", name: "..."}, ...]
  splits JSONB DEFAULT '[]'::jsonb, -- [{name: "...", percentage: 50}, ...]
  explicit BOOLEAN DEFAULT false,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DISTRIBUTION STORE LINKS TABLE
-- Tracks live links once distribution is complete
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_store_links (
  id TEXT PRIMARY KEY,
  release_id TEXT REFERENCES distribution_releases(id) ON DELETE CASCADE,
  store TEXT NOT NULL, -- spotify, apple_music, amazon, etc.
  url TEXT NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_distribution_tracks_release_id ON distribution_tracks(release_id);
CREATE INDEX IF NOT EXISTS idx_distribution_tracks_isrc_full ON distribution_tracks(isrc_full);
CREATE INDEX IF NOT EXISTS idx_distribution_store_links_release_id ON distribution_store_links(release_id);
CREATE INDEX IF NOT EXISTS idx_distribution_releases_status ON distribution_releases(distributor_status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_distribution_releases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_distribution_tracks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_distribution_releases_updated_at
  BEFORE UPDATE ON distribution_releases
  FOR EACH ROW
  EXECUTE FUNCTION update_distribution_releases_updated_at();

CREATE TRIGGER update_distribution_tracks_updated_at
  BEFORE UPDATE ON distribution_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_distribution_tracks_updated_at();

-- ============================================
-- ISRC ASSIGNMENT FUNCTION
-- Atomic ISRC assignment with counter increment
-- ============================================
CREATE OR REPLACE FUNCTION assign_isrc(
  p_prefix TEXT,
  p_year INTEGER,
  p_track_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_serial INTEGER;
  v_isrc TEXT;
BEGIN
  -- Lock and increment counter atomically
  INSERT INTO isrc_counters (prefix, year, next_serial)
  VALUES (p_prefix, p_year, 1)
  ON CONFLICT (prefix, year)
  DO UPDATE SET next_serial = isrc_counters.next_serial + 1
  RETURNING next_serial INTO v_serial;

  -- Format ISRC: PREFIX + YY + SERIAL (5 digits)
  v_isrc := p_prefix || 
            LPAD(p_year::TEXT, 2, '0') || 
            LPAD(v_serial::TEXT, 5, '0');

  -- Update track with ISRC
  UPDATE distribution_tracks
  SET 
    isrc_prefix = p_prefix,
    isrc_year = p_year,
    isrc_serial = v_serial,
    isrc_full = v_isrc,
    updated_at = NOW()
  WHERE id = p_track_id;

  RETURN jsonb_build_object(
    'isrc', v_isrc,
    'prefix', p_prefix,
    'year', p_year,
    'serial', v_serial
  );
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE distribution_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_store_links ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view live releases
CREATE POLICY "Public can view live releases"
  ON distribution_releases
  FOR SELECT
  USING (distributor_status = 'live');

-- Policy: Service role full access to releases
CREATE POLICY "Service role full access to releases"
  ON distribution_releases
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Public can view tracks from live releases
CREATE POLICY "Public can view tracks from live releases"
  ON distribution_tracks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM distribution_releases 
      WHERE id = distribution_tracks.release_id 
      AND distributor_status = 'live'
    )
  );

-- Policy: Service role full access to tracks
CREATE POLICY "Service role full access to tracks"
  ON distribution_tracks
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Public can view store links for live releases
CREATE POLICY "Public can view store links for live releases"
  ON distribution_store_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM distribution_releases 
      WHERE id = distribution_store_links.release_id 
      AND distributor_status = 'live'
    )
  );

-- Policy: Service role full access to store links
CREATE POLICY "Service role full access to store links"
  ON distribution_store_links
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- SOUNDEXCHANGE SUBMISSIONS TABLE
-- Tracks ISRC submissions to SoundExchange
-- ============================================
CREATE TABLE IF NOT EXISTS soundexchange_submissions (
  id TEXT PRIMARY KEY,
  track_id TEXT REFERENCES distribution_tracks(id) ON DELETE CASCADE,
  isrc TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'error')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  response JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_soundexchange_submissions_track_id ON soundexchange_submissions(track_id);
CREATE INDEX IF NOT EXISTS idx_soundexchange_submissions_isrc ON soundexchange_submissions(isrc);
CREATE INDEX IF NOT EXISTS idx_soundexchange_submissions_status ON soundexchange_submissions(status);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_soundexchange_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger
CREATE TRIGGER update_soundexchange_submissions_updated_at
  BEFORE UPDATE ON soundexchange_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_soundexchange_submissions_updated_at();

-- RLS
ALTER TABLE soundexchange_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role full access
CREATE POLICY "Service role full access to soundexchange_submissions"
  ON soundexchange_submissions
  FOR ALL
  USING (auth.role() = 'service_role');
