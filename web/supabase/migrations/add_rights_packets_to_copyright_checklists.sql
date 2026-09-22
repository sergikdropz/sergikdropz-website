-- Editable first-party contract packet drafts (split / producer / collab).
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS rights_packets JSONB NOT NULL DEFAULT '{}'::jsonb;
