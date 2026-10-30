-- Shared public-shop backdrop (color and opacity) set from the admin merch shop.
CREATE TABLE IF NOT EXISTS merch_shop_settings (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE merch_shop_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE merch_shop_settings FROM PUBLIC, anon, authenticated;
