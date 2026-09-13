-- Phase 2: Campaign Automation
-- Tables: campaigns, campaign_templates, campaign_sequences, campaign_analytics
-- Run this in Supabase SQL Editor after Phase 1

-- ============================================================================
-- 1. CAMPAIGN_TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  preview_text TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- e.g., ["fan_name", "release_title", "spotify_url"]
  category TEXT, -- 'release', 'announcement', 'engagement'
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_category ON campaign_templates(category);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_created_at ON campaign_templates(created_at DESC);

-- ============================================================================
-- 2. CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  release_id TEXT, -- Link to music release (optional)
  
  -- Status tracking
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'
  scheduled_send_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Targeting
  fan_segment_filter JSONB DEFAULT '{}'::jsonb, -- Segment criteria
  total_recipients INTEGER DEFAULT 0,
  
  -- Analytics summary
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  last_send_at TIMESTAMPTZ,
  
  -- Admin metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_send_at ON campaigns(scheduled_send_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_release_id ON campaigns(release_id);

-- ============================================================================
-- 3. CAMPAIGN_SEQUENCES TABLE (Email schedule within campaign)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES campaign_templates(id),
  
  -- Timing
  days_offset INTEGER DEFAULT 0, -- T-3, T0, T+2, T+7 relative to release date
  sequence_order INTEGER DEFAULT 0, -- 1st, 2nd, 3rd email in sequence
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'scheduled', 'sending', 'sent', 'failed'
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Stats
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sequences_campaign_id ON campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_status ON campaign_sequences(status);
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_scheduled_for ON campaign_sequences(scheduled_for);

-- ============================================================================
-- 4. CAMPAIGN_SENDS TABLE (Individual send records)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES campaign_sequences(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES fans(id) ON DELETE CASCADE,
  
  -- Email metadata
  to_email TEXT NOT NULL,
  to_name TEXT,
  rendered_subject TEXT,
  rendered_html TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'queued', 'sent', 'opened', 'clicked', 'failed', 'bounced'
  error_message TEXT,
  
  -- Email service metadata
  message_id TEXT, -- Resend message ID
  
  -- Engagement tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  clicked_links JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_sequence_id ON campaign_sends(sequence_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_fan_id ON campaign_sends(fan_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status ON campaign_sends(status);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_message_id ON campaign_sends(message_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_sent_at ON campaign_sends(sent_at DESC);

-- ============================================================================
-- 5. CAMPAIGN_ANALYTICS TABLE (Aggregated daily stats)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Date
  analytics_date DATE NOT NULL,
  
  -- Stats
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  emails_failed INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  
  -- Rates
  open_rate NUMERIC(5, 2) DEFAULT 0,
  click_rate NUMERIC(5, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_id ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_date ON campaign_analytics(analytics_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_analytics_unique ON campaign_analytics(campaign_id, analytics_date);

-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;

-- Admins can do anything with campaigns
CREATE POLICY "Admins can manage campaign templates" ON campaign_templates
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE POLICY "Admins can manage campaigns" ON campaigns
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE POLICY "Admins can manage campaign sequences" ON campaign_sequences
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- Campaign sends: system can read all for processing
CREATE POLICY "System can read campaign sends" ON campaign_sends
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage campaign sends" ON campaign_sends
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- Analytics: admins read only
CREATE POLICY "Admins can read campaign analytics" ON campaign_analytics
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Update campaign stats
CREATE OR REPLACE FUNCTION update_campaign_stats(campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET 
    total_sent = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id IN (SELECT id FROM campaign_sequences WHERE campaign_id = campaign_id) AND status IN ('sent', 'opened', 'clicked')),
    total_opened = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id IN (SELECT id FROM campaign_sequences WHERE campaign_id = campaign_id) AND opened_at IS NOT NULL),
    total_clicked = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id IN (SELECT id FROM campaign_sequences WHERE campaign_id = campaign_id) AND clicked_at IS NOT NULL),
    updated_at = NOW()
  WHERE id = campaign_id;
END;
$$ LANGUAGE plpgsql;

-- Update sequence stats
CREATE OR REPLACE FUNCTION update_sequence_stats(sequence_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaign_sequences
  SET 
    sent_count = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id = campaign_sequences.id AND status IN ('sent', 'opened', 'clicked')),
    opened_count = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id = campaign_sequences.id AND opened_at IS NOT NULL),
    clicked_count = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id = campaign_sequences.id AND clicked_at IS NOT NULL),
    failed_count = (SELECT COUNT(*) FROM campaign_sends WHERE sequence_id = campaign_sequences.id AND status = 'failed'),
    updated_at = NOW()
  WHERE id = sequence_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION update_campaigns_updated_at();

CREATE OR REPLACE FUNCTION update_campaign_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_templates_updated_at
BEFORE UPDATE ON campaign_templates
FOR EACH ROW
EXECUTE FUNCTION update_campaign_templates_updated_at();

CREATE OR REPLACE FUNCTION update_campaign_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_sequences_updated_at
BEFORE UPDATE ON campaign_sequences
FOR EACH ROW
EXECUTE FUNCTION update_campaign_sequences_updated_at();

CREATE OR REPLACE FUNCTION update_campaign_sends_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_sends_updated_at
BEFORE UPDATE ON campaign_sends
FOR EACH ROW
EXECUTE FUNCTION update_campaign_sends_updated_at();

-- ============================================================================
-- 9. VIEWS
-- ============================================================================

-- Campaign performance view
CREATE OR REPLACE VIEW campaign_performance AS
SELECT 
  c.id,
  c.name,
  c.status,
  c.scheduled_send_at,
  c.total_sent,
  c.total_opened,
  c.total_clicked,
  CASE 
    WHEN c.total_sent > 0 THEN ROUND((c.total_opened::NUMERIC / c.total_sent) * 100, 2)
    ELSE 0
  END as open_rate,
  CASE 
    WHEN c.total_sent > 0 THEN ROUND((c.total_clicked::NUMERIC / c.total_sent) * 100, 2)
    ELSE 0
  END as click_rate,
  COUNT(DISTINCT cs.id) as sequence_count
FROM campaigns c
LEFT JOIN campaign_sequences cs ON c.id = cs.campaign_id
GROUP BY c.id, c.name, c.status, c.scheduled_send_at, c.total_sent, c.total_opened, c.total_clicked;

-- Sequence status view
CREATE OR REPLACE VIEW sequence_status AS
SELECT 
  cs.id,
  cs.campaign_id,
  cs.template_id,
  cs.days_offset,
  cs.sequence_order,
  cs.status,
  cs.scheduled_for,
  cs.sent_count,
  cs.opened_count,
  cs.clicked_count,
  ct.name as template_name,
  ct.subject
FROM campaign_sequences cs
LEFT JOIN campaign_templates ct ON cs.template_id = ct.id;
