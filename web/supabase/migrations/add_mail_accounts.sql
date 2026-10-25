-- Editable department mailboxes. Built-in accounts live in code until an admin edits one.

CREATE TABLE IF NOT EXISTS mail_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  local_part TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (local_part)
);

ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mail_accounts'
      AND policyname = 'Admins can select mail_accounts'
  ) THEN
    CREATE POLICY "Admins can select mail_accounts"
      ON mail_accounts
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
