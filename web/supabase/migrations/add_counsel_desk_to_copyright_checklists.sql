-- Music Business Counsel memo and neighboring-rights registration, beside PRO.
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS counsel_audit JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS neighboring_rights_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS neighboring_rights_society TEXT;
