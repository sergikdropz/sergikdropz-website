-- Phase 1: Nurturing Engine Foundation
-- Tables: fans, smartlinks, smartlinks_clicks
-- Run this in Supabase SQL Editor: Database > SQL Editor > New Query > Paste + Run

-- ============================================================================
-- 1. FANS TABLE (Contact database)
-- ============================================================================
CREATE TABLE IF NOT EXISTS fans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  name TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  source TEXT, -- 'contact_form', 'smart_link', 'manual', 'import'
  consent_email BOOLEAN DEFAULT TRUE,
  consent_sms BOOLEAN DEFAULT FALSE,
  
  -- Subscription tracking
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  
  -- Engagement flags
  is_superfan BOOLEAN DEFAULT FALSE,
  last_engaged_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fans table
CREATE INDEX IF NOT EXISTS idx_fans_email ON fans(email);
CREATE INDEX IF NOT EXISTS idx_fans_source ON fans(source);
CREATE INDEX IF NOT EXISTS idx_fans_created_at ON fans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fans_tags ON fans USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fans_subscribed ON fans(subscribed_at DESC);

-- ============================================================================
-- 2. SMARTLINKS TABLE (Short links with tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS smartlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  destination_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT, -- 'release', 'social', 'campaign', 'affiliate'
  
  -- Metadata
  release_id TEXT, -- Link to music release (optional)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Analytics summary (denormalized for speed)
  total_clicks INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  
  -- Admin info
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for smartlinks
CREATE INDEX IF NOT EXISTS idx_smartlinks_slug ON smartlinks(slug);
CREATE INDEX IF NOT EXISTS idx_smartlinks_category ON smartlinks(category);
CREATE INDEX IF NOT EXISTS idx_smartlinks_created_at ON smartlinks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smartlinks_release_id ON smartlinks(release_id);

-- ============================================================================
-- 3. SMARTLINKS_CLICKS TABLE (Click tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS smartlinks_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlink_id UUID NOT NULL REFERENCES smartlinks(id) ON DELETE CASCADE,
  
  -- Click metadata
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  
  -- Request info
  referer TEXT,
  user_agent TEXT,
  ip_address TEXT,
  country TEXT,
  
  -- Session tracking
  session_id TEXT,
  fan_id UUID REFERENCES fans(id) ON DELETE SET NULL,
  
  clicked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for smartlinks_clicks (critical for analytics)
CREATE INDEX IF NOT EXISTS idx_smartlinks_clicks_link_id ON smartlinks_clicks(smartlink_id);
CREATE INDEX IF NOT EXISTS idx_smartlinks_clicks_clicked_at ON smartlinks_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_smartlinks_clicks_fan_id ON smartlinks_clicks(fan_id);
CREATE INDEX IF NOT EXISTS idx_smartlinks_clicks_session ON smartlinks_clicks(session_id);
CREATE INDEX IF NOT EXISTS idx_smartlinks_clicks_utm_source ON smartlinks_clicks(utm_source);

-- ============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE fans ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlinks_clicks ENABLE ROW LEVEL SECURITY;

-- FANS: Only authenticated admins can read/write
CREATE POLICY "Admins can read fans" ON fans
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE POLICY "Admins can insert fans" ON fans
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
    OR auth.uid() IS NULL -- Allow public form submission
  );

CREATE POLICY "Admins can update fans" ON fans
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- SMARTLINKS: Read public (for redirect), write only admins
CREATE POLICY "Anyone can read smartlinks" ON smartlinks
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert smartlinks" ON smartlinks
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE POLICY "Admins can update smartlinks" ON smartlinks
  FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- SMARTLINKS_CLICKS: Anyone can insert (public tracking), admins read
CREATE POLICY "Anyone can track clicks" ON smartlinks_clicks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can read click data" ON smartlinks_clicks
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to update smartlinks click stats (called after each click)
CREATE OR REPLACE FUNCTION update_smartlink_click_stats(link_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE smartlinks
  SET 
    total_clicks = (SELECT COUNT(*) FROM smartlinks_clicks WHERE smartlink_id = link_id),
    unique_clicks = (SELECT COUNT(DISTINCT session_id) FROM smartlinks_clicks WHERE smartlink_id = link_id),
    last_clicked_at = NOW(),
    updated_at = NOW()
  WHERE id = link_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update fan engagement timestamp
CREATE OR REPLACE FUNCTION update_fan_engagement(fan_email TEXT)
RETURNS void AS $$
BEGIN
  UPDATE fans
  SET last_engaged_at = NOW(), updated_at = NOW()
  WHERE email = fan_email;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. TRIGGERS (Optional: Auto-update timestamps)
-- ============================================================================

-- Auto-update updated_at on fans
CREATE OR REPLACE FUNCTION update_fans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fans_updated_at
BEFORE UPDATE ON fans
FOR EACH ROW
EXECUTE FUNCTION update_fans_updated_at();

-- Auto-update updated_at on smartlinks
CREATE OR REPLACE FUNCTION update_smartlinks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER smartlinks_updated_at
BEFORE UPDATE ON smartlinks
FOR EACH ROW
EXECUTE FUNCTION update_smartlinks_updated_at();

-- ============================================================================
-- 7. TEST DATA (Optional: Remove before production)
-- ============================================================================

-- Create test fans
INSERT INTO fans (email, name, source, tags) VALUES
  ('superfan@example.com', 'Superfan One', 'smart_link', '["superfan", "early-adopter"]'),
  ('fan@example.com', 'Regular Fan', 'contact_form', '["engaged"]'),
  ('subscriber@example.com', 'Newsletter Sub', 'import', '[]')
ON CONFLICT (email) DO NOTHING;

-- Create test smart links
INSERT INTO smartlinks (slug, destination_url, title, category) VALUES
  ('drop-new-ep', 'https://open.spotify.com/album/test123', 'New EP Release', 'release'),
  ('dj-mix-youtube', 'https://www.youtube.com/watch?v=test', 'DJ Mix Video', 'social'),
  ('discord-invite', 'https://discord.gg/sergikdropz', 'Join Discord Community', 'social')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 8. VIEWS (For easy querying in admin)
-- ============================================================================

-- View: Smart link performance
CREATE OR REPLACE VIEW smartlinks_performance AS
SELECT 
  s.id,
  s.slug,
  s.title,
  s.category,
  s.total_clicks,
  s.unique_clicks,
  s.last_clicked_at,
  COUNT(DISTINCT c.fan_id) as fan_clicks,
  COUNT(DISTINCT c.session_id) as session_clicks
FROM smartlinks s
LEFT JOIN smartlinks_clicks c ON s.id = c.smartlink_id
GROUP BY s.id, s.slug, s.title, s.category, s.total_clicks, s.unique_clicks, s.last_clicked_at;

-- View: Fan engagement summary
CREATE OR REPLACE VIEW fans_engagement_summary AS
SELECT 
  f.id,
  f.email,
  f.name,
  f.source,
  f.is_superfan,
  COUNT(DISTINCT c.id) as total_clicks,
  COUNT(DISTINCT c.smartlink_id) as unique_links_clicked,
  f.last_engaged_at,
  f.created_at
FROM fans f
LEFT JOIN smartlinks_clicks c ON f.id = c.fan_id
GROUP BY f.id, f.email, f.name, f.source, f.is_superfan, f.last_engaged_at, f.created_at;
