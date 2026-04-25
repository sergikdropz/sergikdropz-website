-- Phase 3: Fan Segments
-- Tables: fan_segments, fan_segment_members

CREATE TABLE IF NOT EXISTS fan_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  filters JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fan_segment_members (
  segment_id UUID NOT NULL REFERENCES fan_segments(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES fans(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (segment_id, fan_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_segments_created_at ON fan_segments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_segment_members_fan_id ON fan_segment_members(fan_id);
CREATE INDEX IF NOT EXISTS idx_fan_segment_members_segment_id ON fan_segment_members(segment_id);

ALTER TABLE fan_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_segment_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fan segments" ON fan_segments
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE POLICY "Admins can manage fan segment members" ON fan_segment_members
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admins WHERE active = true)
  );

CREATE OR REPLACE FUNCTION update_fan_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fan_segments_updated_at
BEFORE UPDATE ON fan_segments
FOR EACH ROW
EXECUTE FUNCTION update_fan_segments_updated_at();

CREATE OR REPLACE VIEW fan_segments_summary AS
SELECT
  s.id,
  s.name,
  s.description,
  s.filters,
  s.created_at,
  s.updated_at,
  COUNT(m.fan_id) AS member_count
FROM fan_segments s
LEFT JOIN fan_segment_members m ON s.id = m.segment_id
GROUP BY s.id, s.name, s.description, s.filters, s.created_at, s.updated_at;
