-- Copyright workflow checklist per distribution release
CREATE TABLE IF NOT EXISTS release_copyright_checklists (
  release_id TEXT PRIMARY KEY REFERENCES distribution_releases(id) ON DELETE CASCADE,
  rights_intake_complete BOOLEAN NOT NULL DEFAULT false,
  legal_locked BOOLEAN NOT NULL DEFAULT false,
  composition_registered BOOLEAN NOT NULL DEFAULT false,
  master_registered BOOLEAN NOT NULL DEFAULT false,
  pro_registered BOOLEAN NOT NULL DEFAULT false,
  monitoring_enabled BOOLEAN NOT NULL DEFAULT false,
  owner_name TEXT,
  role_queue TEXT DEFAULT 'legal' CHECK (role_queue IN ('a_and_r', 'legal', 'metadata', 'marketing')),
  split_sheet_status TEXT DEFAULT 'missing' CHECK (split_sheet_status IN ('missing', 'pending', 'approved')),
  producer_agreement_status TEXT DEFAULT 'missing' CHECK (producer_agreement_status IN ('missing', 'pending', 'approved')),
  sample_clearance_status TEXT DEFAULT 'missing' CHECK (sample_clearance_status IN ('missing', 'pending', 'approved')),
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS role_queue TEXT DEFAULT 'legal';
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS split_sheet_status TEXT DEFAULT 'missing';
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS producer_agreement_status TEXT DEFAULT 'missing';
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS sample_clearance_status TEXT DEFAULT 'missing';
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE OR REPLACE FUNCTION update_release_copyright_checklists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_release_copyright_checklists_updated_at
  ON release_copyright_checklists;

CREATE TRIGGER update_release_copyright_checklists_updated_at
  BEFORE UPDATE ON release_copyright_checklists
  FOR EACH ROW
  EXECUTE FUNCTION update_release_copyright_checklists_updated_at();

ALTER TABLE release_copyright_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to release_copyright_checklists"
  ON release_copyright_checklists;

CREATE POLICY "Service role full access to release_copyright_checklists"
  ON release_copyright_checklists
  FOR ALL
  USING (auth.role() = 'service_role');
