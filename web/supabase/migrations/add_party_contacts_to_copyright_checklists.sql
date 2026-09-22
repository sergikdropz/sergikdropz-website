-- Collaborator emails for Rights contract signing (release-level party contacts).
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS party_contacts JSONB DEFAULT '[]'::jsonb;
