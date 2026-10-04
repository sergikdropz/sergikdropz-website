-- Release Collab phase 2: inbound email, system thread lines, contract send kinds.

ALTER TABLE release_collab_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'app'
    CHECK (channel IN ('app', 'inbound_email', 'system')),
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS inbound_email_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_collab_messages_inbound_email_id
  ON release_collab_messages(inbound_email_id)
  WHERE inbound_email_id IS NOT NULL;

ALTER TABLE release_collab_email_sends
  DROP CONSTRAINT IF EXISTS release_collab_email_sends_kind_check;

ALTER TABLE release_collab_email_sends
  ADD CONSTRAINT release_collab_email_sends_kind_check
  CHECK (kind IN (
    'thread_notify',
    'review_invite',
    'hub_email',
    'other',
    'contract_split_sheet',
    'contract_producer_agreement',
    'contract_collab_agreement'
  ));

COMMENT ON COLUMN release_collab_messages.channel IS 'app = studio/portal; inbound_email = Resend receive; system = automated collab events';
COMMENT ON COLUMN release_collab_messages.inbound_email_id IS 'Resend receiving email_id — dedupe inbound webhook retries';
