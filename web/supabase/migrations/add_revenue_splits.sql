-- Revenue splits: tracks what's owed to collaborators from sales
CREATE TABLE IF NOT EXISTS revenue_splits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  stripe_session_id text NOT NULL,
  product_id text NOT NULL,
  product_type text NOT NULL,
  collaborator_id text NOT NULL,
  collaborator_name text NOT NULL,
  track_title text,
  total_sale_amount integer NOT NULL DEFAULT 0,
  collaborator_amount integer NOT NULL DEFAULT 0,
  split_percent numeric(5,2) NOT NULL DEFAULT 50.00,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid', 'voided')),
  paid_at timestamptz,
  paid_via text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_revenue_splits_collaborator ON revenue_splits(collaborator_id);
CREATE INDEX idx_revenue_splits_status ON revenue_splits(status);
CREATE INDEX idx_revenue_splits_stripe_session ON revenue_splits(stripe_session_id);

-- RLS
ALTER TABLE revenue_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on revenue_splits"
  ON revenue_splits FOR ALL
  USING (true)
  WITH CHECK (true);
