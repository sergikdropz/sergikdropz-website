-- DocuSign envelope ids and signer status for Rights contract packets.
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS docusign_envelopes JSONB DEFAULT '[]'::jsonb;
