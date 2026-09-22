-- Cover / sample packet flags used by Release Studio Rights.
ALTER TABLE distribution_tracks
  ADD COLUMN IF NOT EXISTS mechanical_licensed BOOLEAN,
  ADD COLUMN IF NOT EXISTS contains_samples BOOLEAN DEFAULT false;
