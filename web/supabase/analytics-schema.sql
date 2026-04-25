-- Analytics Events Table for SERGIK Website
-- Run this in Supabase SQL Editor

-- Create analytics_events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'page_view', 'track_play', 'download', 'purchase', etc.
  event_data JSONB, -- Additional event-specific data
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);

-- Enable Row Level Security
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Public can insert events (for tracking)
CREATE POLICY "Public can insert analytics events"
  ON analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Only admins can view analytics events
CREATE POLICY "Admins can view analytics events"
  ON analytics_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid()
      AND admins.active = true
    )
  );

-- Policy: Service role can do everything (for API routes)
CREATE POLICY "Service role full access to analytics"
  ON analytics_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
