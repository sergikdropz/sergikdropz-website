-- Add licenses table for beat licensing
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL,
  license_tier TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  stripe_session_id TEXT,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  terms_snapshot JSONB NOT NULL DEFAULT '{}',
  stream_limit INTEGER,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON licenses(customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_track_id ON licenses(track_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- Add license_tier and product_type columns to purchases table
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS license_tier TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'track';
