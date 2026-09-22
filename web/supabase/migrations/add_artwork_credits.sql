-- Cover artwork credit metadata for Release Studio (designer / photographer / illustrator).
ALTER TABLE distribution_releases
  ADD COLUMN IF NOT EXISTS artwork_designer TEXT,
  ADD COLUMN IF NOT EXISTS artwork_photographer TEXT,
  ADD COLUMN IF NOT EXISTS artwork_illustrator TEXT;
