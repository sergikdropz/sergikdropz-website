-- Link memberships to Supabase auth user (set from Stripe checkout metadata on subscription)
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);

COMMENT ON COLUMN memberships.user_id IS 'Supabase user when subscription checkout was signed in';
