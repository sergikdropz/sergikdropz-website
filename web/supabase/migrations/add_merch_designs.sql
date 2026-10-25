-- Designs created in the admin fitting room.
CREATE TABLE IF NOT EXISTS merch_designs (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_designs_status ON merch_designs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merch_designs_slug ON merch_designs(slug);
