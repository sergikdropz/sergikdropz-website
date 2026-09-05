-- Playlist front-end visibility (independent of folder EP/album hidden)
ALTER TABLE music_library_playlists
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false;

UPDATE music_library_playlists
SET hidden = false
WHERE hidden IS NULL;

CREATE INDEX IF NOT EXISTS idx_music_library_playlists_hidden
  ON music_library_playlists(hidden);
