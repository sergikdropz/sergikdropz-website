-- Label royalty ops: partner statements → payee ledger → payouts
-- Optional production store (local/dev uses web/data/royalties/store.json until migrated).

CREATE TABLE IF NOT EXISTS royalty_payees (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  payment_method text,
  notes text,
  is_label_entity boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS royalty_statements (
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('distrokid', 'revelator', 'manual', 'generic')),
  filename text,
  period_label text,
  currency text NOT NULL DEFAULT 'USD',
  gross_cents integer NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL UNIQUE,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS royalty_statement_lines (
  id text PRIMARY KEY,
  statement_id text NOT NULL REFERENCES royalty_statements(id) ON DELETE CASCADE,
  isrc text,
  upc text,
  track_title text,
  album_title text,
  artist_name text,
  store text,
  territory text,
  quantity numeric,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  sale_date text,
  raw jsonb
);

CREATE INDEX IF NOT EXISTS idx_royalty_lines_statement ON royalty_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_royalty_lines_isrc ON royalty_statement_lines(isrc);

CREATE TABLE IF NOT EXISTS royalty_ledger_entries (
  id text PRIMARY KEY,
  statement_id text NOT NULL REFERENCES royalty_statements(id) ON DELETE CASCADE,
  statement_line_id text NOT NULL REFERENCES royalty_statement_lines(id) ON DELETE CASCADE,
  payee_id text NOT NULL REFERENCES royalty_payees(id),
  payee_name text NOT NULL,
  isrc text,
  track_title text,
  store text,
  split_percent numeric(6,2) NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid', 'voided')),
  payout_id text,
  release_id text,
  track_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_royalty_ledger_payee ON royalty_ledger_entries(payee_id);
CREATE INDEX IF NOT EXISTS idx_royalty_ledger_status ON royalty_ledger_entries(status);

CREATE TABLE IF NOT EXISTS royalty_payouts (
  id text PRIMARY KEY,
  payee_id text NOT NULL REFERENCES royalty_payees(id),
  payee_name text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  ledger_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_via text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE royalty_payees ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on royalty_payees"
  ON royalty_payees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access on royalty_statements"
  ON royalty_statements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access on royalty_statement_lines"
  ON royalty_statement_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access on royalty_ledger_entries"
  ON royalty_ledger_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access on royalty_payouts"
  ON royalty_payouts FOR ALL USING (true) WITH CHECK (true);

INSERT INTO royalty_payees (id, name, notes, is_label_entity)
VALUES (
  'nexus-studios-az-llc',
  'Nexus Studios AZ LLC',
  'Sole partner payee — DistroKid / Revelator deposit to LLC; Studio pays collabs',
  true
)
ON CONFLICT (id) DO NOTHING;
