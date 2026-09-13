-- Fans who complete password sign-up or set a password can use shop checkout / downloads linkage.
ALTER TABLE fan_profiles ADD COLUMN IF NOT EXISTS password_credential_at TIMESTAMPTZ;

COMMENT ON COLUMN fan_profiles.password_credential_at IS 'Set when the fan registers with a password or adds one; required for music/merch Stripe checkout APIs.';
