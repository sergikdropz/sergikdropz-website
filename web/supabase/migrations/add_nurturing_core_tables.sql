-- Core nurturing tables required by admin AI + nurturing APIs

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  release_id TEXT,
  fan_segment_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  scheduled_send_at TIMESTAMPTZ,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_opened INTEGER NOT NULL DEFAULT 0,
  total_clicked INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_release_id ON campaigns(release_id);

CREATE TABLE IF NOT EXISTS smartlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  release_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  unique_clicks INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smartlinks_category ON smartlinks(category);
CREATE INDEX IF NOT EXISTS idx_smartlinks_created_at ON smartlinks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smartlinks_release_id ON smartlinks(release_id);

CREATE OR REPLACE FUNCTION set_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_campaigns_updated_at ON campaigns;
CREATE TRIGGER tr_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION set_campaigns_updated_at();

CREATE OR REPLACE FUNCTION set_smartlinks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_smartlinks_updated_at ON smartlinks;
CREATE TRIGGER tr_smartlinks_updated_at
  BEFORE UPDATE ON smartlinks
  FOR EACH ROW
  EXECUTE FUNCTION set_smartlinks_updated_at();

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlinks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns' AND policyname = 'Admins can select campaigns'
  ) THEN
    CREATE POLICY "Admins can select campaigns"
      ON campaigns
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM admins
          WHERE admins.user_id = auth.uid() AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns' AND policyname = 'Service role full access to campaigns'
  ) THEN
    CREATE POLICY "Service role full access to campaigns"
      ON campaigns
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'smartlinks' AND policyname = 'Admins can select smartlinks'
  ) THEN
    CREATE POLICY "Admins can select smartlinks"
      ON smartlinks
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM admins
          WHERE admins.user_id = auth.uid() AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'smartlinks' AND policyname = 'Service role full access to smartlinks'
  ) THEN
    CREATE POLICY "Service role full access to smartlinks"
      ON smartlinks
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
