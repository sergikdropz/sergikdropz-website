-- Merch orders table for Printful print-on-demand
CREATE TABLE IF NOT EXISTS merch_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id TEXT,
  printful_order_id TEXT,
  customer_email TEXT,
  shipping_address JSONB,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal INTEGER NOT NULL DEFAULT 0,
  shipping_cost INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  tracking_number TEXT,
  tracking_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_email ON merch_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_merch_orders_status ON merch_orders(status);
CREATE INDEX IF NOT EXISTS idx_merch_orders_printful ON merch_orders(printful_order_id);
