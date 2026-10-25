-- SERGIK client licensing (sync and custom production).
-- Shop beat-lease rows stay in licenses / purchases.
-- Apply in the Supabase SQL editor. Service role only.

CREATE TABLE IF NOT EXISTS licensing_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  phone TEXT,
  website TEXT,
  country TEXT,
  address TEXT,
  contact_role TEXT,
  party_kind TEXT,
  contracting_entity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licensing_clients_email ON licensing_clients (email);

CREATE TABLE IF NOT EXISTS licensing_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES licensing_clients(id),
  kind TEXT NOT NULL CHECK (kind IN ('catalog', 'custom_production')),
  status TEXT NOT NULL,
  track_id TEXT,
  track_title TEXT,
  project JSONB NOT NULL DEFAULT '{}'::jsonb,
  rights JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_token_hash TEXT NOT NULL UNIQUE,
  email_token_hash TEXT,
  email_token_expires_at TIMESTAMPTZ,
  risk_level TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  rights_cleared BOOLEAN,
  rights_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_cleared_at TIMESTAMPTZ,
  quote_cents INTEGER,
  quote_currency TEXT NOT NULL DEFAULT 'usd',
  quote_note TEXT,
  quote_status TEXT NOT NULL DEFAULT 'none',
  agreement_body TEXT,
  agreement_production_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payment_status TEXT NOT NULL DEFAULT 'none',
  stripe_session_id TEXT UNIQUE,
  license_status TEXT NOT NULL DEFAULT 'none',
  license_public_id TEXT UNIQUE,
  activation_note TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licensing_inquiries_status ON licensing_inquiries (status);
CREATE INDEX IF NOT EXISTS idx_licensing_inquiries_created ON licensing_inquiries (created_at DESC);

CREATE TABLE IF NOT EXISTS licensing_inquiry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES licensing_inquiries(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licensing_inquiry_events_inquiry ON licensing_inquiry_events (inquiry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS licensing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES licensing_inquiries(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_event_id TEXT,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE licensing_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_inquiry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS licensing_clients_deny ON licensing_clients;
CREATE POLICY licensing_clients_deny ON licensing_clients
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS licensing_inquiries_deny ON licensing_inquiries;
CREATE POLICY licensing_inquiries_deny ON licensing_inquiries
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS licensing_inquiry_events_deny ON licensing_inquiry_events;
CREATE POLICY licensing_inquiry_events_deny ON licensing_inquiry_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS licensing_payments_deny ON licensing_payments;
CREATE POLICY licensing_payments_deny ON licensing_payments
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
