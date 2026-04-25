-- Add archive fields for safety (no hard deletes)
ALTER TABLE music_library_folders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE music_library_tracks
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE music_library_playlists
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_music_library_folders_archived ON music_library_folders(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_archived ON music_library_tracks(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_playlists_archived ON music_library_playlists(is_archived);
-- Add archive fields for safety (no hard deletes)
ALTER TABLE music_library_folders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE music_library_tracks
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE music_library_playlists
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_music_library_folders_archived ON music_library_folders(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_tracks_archived ON music_library_tracks(is_archived);
CREATE INDEX IF NOT EXISTS idx_music_library_playlists_archived ON music_library_playlists(is_archived);
