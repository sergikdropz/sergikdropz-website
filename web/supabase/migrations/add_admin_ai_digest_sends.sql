-- Audit log for scheduled / manual Admin AI digest webhook deliveries

CREATE TABLE IF NOT EXISTS admin_ai_digest_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('cron', 'manual_test')),
  delivered BOOLEAN NOT NULL DEFAULT false,
  delivery_reason TEXT,
  error_message TEXT,
  digest_generated_at TIMESTAMPTZ NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_ai_digest_sends_created_at ON admin_ai_digest_sends(created_at DESC);

ALTER TABLE admin_ai_digest_sends ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_ai_digest_sends'
      AND policyname = 'Admins can select admin_ai_digest_sends'
  ) THEN
    CREATE POLICY "Admins can select admin_ai_digest_sends"
      ON admin_ai_digest_sends
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM admins
          WHERE admins.user_id = auth.uid()
            AND admins.active = true
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_ai_digest_sends'
      AND policyname = 'Service role full access to admin_ai_digest_sends'
  ) THEN
    CREATE POLICY "Service role full access to admin_ai_digest_sends"
      ON admin_ai_digest_sends
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
