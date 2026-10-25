-- Department mail desk: inbox, sent, drafts, scheduled, trash.
-- Outbound rows are written when an admin sends or saves. Inbound rows are written
-- from the Resend webhook when the recipient is a department mailbox.

CREATE TABLE IF NOT EXISTS department_mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out',
  from_address TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  to_addresses TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  unread BOOLEAN NOT NULL DEFAULT false,
  resend_id TEXT,
  inbound_id TEXT,
  scheduled_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT department_mail_messages_folder_check
    CHECK (folder IN ('inbox', 'sent', 'drafts', 'scheduled', 'trash')),
  CONSTRAINT department_mail_messages_direction_check
    CHECK (direction IN ('in', 'out'))
);

CREATE UNIQUE INDEX IF NOT EXISTS department_mail_messages_inbound_id_key
  ON department_mail_messages (inbound_id)
  WHERE inbound_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS department_mail_messages_folder_updated_idx
  ON department_mail_messages (folder, updated_at DESC);

CREATE INDEX IF NOT EXISTS department_mail_messages_resend_id_idx
  ON department_mail_messages (resend_id)
  WHERE resend_id IS NOT NULL;

ALTER TABLE department_mail_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'department_mail_messages'
      AND policyname = 'Admins manage department_mail_messages'
  ) THEN
    CREATE POLICY "Admins manage department_mail_messages"
      ON department_mail_messages
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM admins
          WHERE admins.user_id = auth.uid()
            AND admins.active = true
        )
      )
      WITH CHECK (
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
