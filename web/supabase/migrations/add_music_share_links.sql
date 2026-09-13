-- SoundCloud-style share links for vault tracks and folders (EPs/albums)
CREATE TABLE IF NOT EXISTS music_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('track', 'folder')),
  target_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'unlisted' CHECK (visibility IN ('public', 'unlisted', 'disabled')),
  title_override TEXT,
  created_by TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  play_count INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active share per target (revoke/disable before creating another intentional link).
CREATE UNIQUE INDEX IF NOT EXISTS music_share_links_active_target_uidx
  ON music_share_links (kind, target_id)
  WHERE revoked_at IS NULL AND visibility <> 'disabled';

CREATE INDEX IF NOT EXISTS music_share_links_token_idx
  ON music_share_links (token)
  WHERE revoked_at IS NULL AND visibility <> 'disabled';

CREATE INDEX IF NOT EXISTS music_share_links_target_idx
  ON music_share_links (kind, target_id);

ALTER TABLE music_share_links ENABLE ROW LEVEL SECURITY;

-- Server uses service role / privileged client; block direct anon/auth table access.
DROP POLICY IF EXISTS music_share_links_deny_all ON music_share_links;
CREATE POLICY music_share_links_deny_all ON music_share_links
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
