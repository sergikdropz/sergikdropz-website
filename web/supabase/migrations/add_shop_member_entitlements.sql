-- Shop credits (membership → digital purchase balance) and monthly member download quotas.

CREATE TABLE IF NOT EXISTS shop_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_cents INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscription_grant', 'checkout_spend', 'refund', 'expire', 'admin_adjust')),
  plan_id TEXT,
  stripe_invoice_id TEXT,
  stripe_checkout_session_id TEXT,
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shop_credit_ledger_invoice_unique UNIQUE (stripe_invoice_id)
);

CREATE INDEX IF NOT EXISTS shop_credit_ledger_user_idx ON shop_credit_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS member_download_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  mp3_used INTEGER NOT NULL DEFAULT 0 CHECK (mp3_used >= 0),
  wav_used INTEGER NOT NULL DEFAULT 0 CHECK (wav_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_download_usage_period_unique UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS member_download_usage_user_idx ON member_download_usage (user_id, period_end DESC);

ALTER TABLE shop_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_download_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_credit_accounts_deny ON shop_credit_accounts;
CREATE POLICY shop_credit_accounts_deny ON shop_credit_accounts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS shop_credit_ledger_deny ON shop_credit_ledger;
CREATE POLICY shop_credit_ledger_deny ON shop_credit_ledger FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS member_download_usage_deny ON member_download_usage;
CREATE POLICY member_download_usage_deny ON member_download_usage FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
