-- Filenames stored with department mail. File bytes are sent through Resend and are not kept here.

ALTER TABLE department_mail_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
