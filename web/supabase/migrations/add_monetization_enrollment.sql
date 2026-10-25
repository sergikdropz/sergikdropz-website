-- Program evidence on Rights. DistroKid Social Media Pack is not stored here.
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS monetization_enrollment JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Optional SQL copy of web/data/royalties/store.json. Skip when that table is absent.
DO $$
BEGIN
  IF to_regclass('public.royalty_statements') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE royalty_statements DROP CONSTRAINT IF EXISTS royalty_statements_source_check;
  ALTER TABLE royalty_statements
    ADD CONSTRAINT royalty_statements_source_check
    CHECK (source IN ('distrokid', 'revelator', 'manual', 'generic', 'meta_creator', 'meta_ads'));
  ALTER TABLE royalty_statements
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS amount_basis TEXT;
END $$;
