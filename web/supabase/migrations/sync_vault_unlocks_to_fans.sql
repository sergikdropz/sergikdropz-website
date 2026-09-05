-- Keep the Fans admin CRM in sync with vault unlocks.
-- `fan_leads` stores unlock timestamps; `fans` is what /admin/nurturing/fans reads.

CREATE TABLE IF NOT EXISTS fan_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  source TEXT,
  campaign TEXT,
  first_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  last_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS fans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  name TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  consent_email BOOLEAN DEFAULT TRUE,
  consent_sms BOOLEAN DEFAULT FALSE,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  is_superfan BOOLEAN DEFAULT FALSE,
  last_engaged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fans_email ON fans(email);
CREATE INDEX IF NOT EXISTS idx_fans_source ON fans(source);
CREATE INDEX IF NOT EXISTS idx_fans_created_at ON fans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fans_tags ON fans USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fans_subscribed ON fans(subscribed_at DESC);

ALTER TABLE fans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sync_fan_lead_to_fans()
RETURNS trigger AS $$
BEGIN
  INSERT INTO fans (
    email,
    name,
    source,
    tags,
    consent_email,
    last_engaged_at,
    metadata,
    created_at,
    subscribed_at
  )
  VALUES (
    lower(NEW.email),
    COALESCE(NEW.display_name, ''),
    COALESCE(NULLIF(trim(NEW.source), ''), 'vault_unlock'),
    '["vault"]'::jsonb,
    true,
    COALESCE(NEW.last_unlock_at, now()),
    jsonb_strip_nulls(jsonb_build_object(
      'campaign', NEW.campaign,
      'vault_unlocked', true
    )),
    COALESCE(NEW.first_unlock_at, NEW.created_at, now()),
    COALESCE(NEW.first_unlock_at, NEW.created_at, now())
  )
  ON CONFLICT (email) DO UPDATE SET
    name = CASE
      WHEN fans.name IS NULL OR btrim(fans.name) = '' THEN EXCLUDED.name
      ELSE fans.name
    END,
    source = COALESCE(NULLIF(fans.source, ''), EXCLUDED.source),
    tags = CASE
      WHEN COALESCE(fans.tags, '[]'::jsonb) @> '["vault"]'::jsonb THEN fans.tags
      ELSE COALESCE(fans.tags, '[]'::jsonb) || '["vault"]'::jsonb
    END,
    last_engaged_at = EXCLUDED.last_engaged_at,
    metadata = COALESCE(fans.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fan_leads_sync_fans ON fan_leads;
CREATE TRIGGER trg_fan_leads_sync_fans
AFTER INSERT OR UPDATE ON fan_leads
FOR EACH ROW
EXECUTE FUNCTION sync_fan_lead_to_fans();

INSERT INTO fans (
  email,
  name,
  source,
  tags,
  consent_email,
  last_engaged_at,
  metadata,
  created_at,
  subscribed_at
)
SELECT
  lower(l.email),
  COALESCE(l.display_name, ''),
  COALESCE(NULLIF(trim(l.source), ''), 'vault_unlock'),
  '["vault"]'::jsonb,
  true,
  COALESCE(l.last_unlock_at, l.created_at, now()),
  jsonb_strip_nulls(jsonb_build_object(
    'campaign', l.campaign,
    'vault_unlocked', true
  )),
  COALESCE(l.first_unlock_at, l.created_at, now()),
  COALESCE(l.first_unlock_at, l.created_at, now())
FROM fan_leads l
ON CONFLICT (email) DO UPDATE SET
  name = CASE
    WHEN fans.name IS NULL OR btrim(fans.name) = '' THEN EXCLUDED.name
    ELSE fans.name
  END,
  source = COALESCE(NULLIF(fans.source, ''), EXCLUDED.source),
  tags = CASE
    WHEN COALESCE(fans.tags, '[]'::jsonb) @> '["vault"]'::jsonb THEN fans.tags
    ELSE COALESCE(fans.tags, '[]'::jsonb) || '["vault"]'::jsonb
  END,
  last_engaged_at = EXCLUDED.last_engaged_at,
  metadata = COALESCE(fans.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
