-- Activity Logs Table for SERGIK Website
-- Run this in Supabase SQL Editor

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', etc.
  resource_type TEXT, -- 'track', 'gallery', 'purchase', 'user', 'setting', etc.
  resource_id TEXT, -- ID of the resource being acted upon
  details JSONB, -- Additional details about the action
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource_type ON activity_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource_id ON activity_logs(resource_id);

-- Enable Row Level Security
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view activity logs
CREATE POLICY "Admins can view activity logs"
  ON activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid()
      AND admins.active = true
    )
  );

-- Policy: Only admins can insert activity logs
CREATE POLICY "Admins can insert activity logs"
  ON activity_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid()
      AND admins.active = true
    )
  );

-- Policy: Service role can do everything (for API routes)
CREATE POLICY "Service role full access to activity logs"
  ON activity_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
