-- One row of operator facts for sync licensing.
-- Does not approve a contract. Service role only.

CREATE TABLE IF NOT EXISTS licensing_operator_facts (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  copyright_owner TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (copyright_owner IN ('unconfirmed', 'llc', 'personal')),
  stripe_account_name TEXT,
  stripe_name_matches_llc BOOLEAN,
  stripe_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO licensing_operator_facts (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE licensing_operator_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS licensing_operator_facts_deny ON licensing_operator_facts;
CREATE POLICY licensing_operator_facts_deny ON licensing_operator_facts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
