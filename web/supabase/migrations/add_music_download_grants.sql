-- Private download grants for share links.
-- A link stays locked until the admin adds emails. Format (mp3/wav) and
-- scope (one track vs the whole release) are part of the grant.

CREATE TABLE IF NOT EXISTS music_download_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES music_share_links(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('track', 'release')),
  -- Empty string when scope is the whole release (NULL would not be unique).
  track_id TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL CHECK (format IN ('mp3', 'wav')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS music_download_grants_selection_uidx
  ON music_download_grants (share_id, scope, track_id, format);

CREATE INDEX IF NOT EXISTS music_download_grants_share_idx
  ON music_download_grants (share_id);

CREATE TABLE IF NOT EXISTS music_download_grant_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES music_download_grants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grant_id, email)
);

CREATE INDEX IF NOT EXISTS music_download_grant_emails_email_idx
  ON music_download_grant_emails (email);

CREATE TABLE IF NOT EXISTS music_download_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES music_download_grants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS music_download_access_codes_grant_idx
  ON music_download_access_codes (grant_id, email);

ALTER TABLE music_download_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_download_grant_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_download_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS music_download_grants_deny_all ON music_download_grants;
CREATE POLICY music_download_grants_deny_all ON music_download_grants
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS music_download_grant_emails_deny_all ON music_download_grant_emails;
CREATE POLICY music_download_grant_emails_deny_all ON music_download_grant_emails
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS music_download_access_codes_deny_all ON music_download_access_codes;
CREATE POLICY music_download_access_codes_deny_all ON music_download_access_codes
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
