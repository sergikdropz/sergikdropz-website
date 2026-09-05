-- Persist Auto DJ settings per signed-in fan (JSON blob).
ALTER TABLE fan_profiles
  ADD COLUMN IF NOT EXISTS auto_dj_settings JSONB DEFAULT NULL;

COMMENT ON COLUMN fan_profiles.auto_dj_settings IS 'Saved MusicPlayer Auto DJ preferences (mix style, techniques, phrase bars, etc.)';
