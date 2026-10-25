-- One row per owner release reminder so cron and the Mac job do not send it twice.

CREATE TABLE IF NOT EXISTS owner_email_reminders (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  to_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE owner_email_reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'owner_email_reminders'
      AND policyname = 'Admins can select owner_email_reminders'
  ) THEN
    CREATE POLICY "Admins can select owner_email_reminders"
      ON owner_email_reminders
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
