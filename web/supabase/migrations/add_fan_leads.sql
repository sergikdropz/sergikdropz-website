-- Email-first / nurturing pipeline: leads can unlock vault before full auth + membership
CREATE TABLE IF NOT EXISTS fan_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  source TEXT,
  campaign TEXT,
  first_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  last_unlock_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fan_leads_created_at ON fan_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fan_leads_linked_user ON fan_leads(linked_user_id);

ALTER TABLE fan_leads ENABLE ROW LEVEL SECURITY;
