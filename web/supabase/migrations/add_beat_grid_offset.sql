-- Add beat grid offset for DJ mode grid alignment
ALTER TABLE music_library_tracks
  ADD COLUMN IF NOT EXISTS beat_grid_offset double precision;
