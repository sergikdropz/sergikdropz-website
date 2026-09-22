-- SERGIK-first Social / UGC extra (YouTube Content ID, TikTok, Meta).
-- Opt-in is first-party on Release Studio. Do not route this extra through DistroKid.
ALTER TABLE release_copyright_checklists
  ADD COLUMN IF NOT EXISTS ugc_pack JSONB NOT NULL DEFAULT '{}'::jsonb;
