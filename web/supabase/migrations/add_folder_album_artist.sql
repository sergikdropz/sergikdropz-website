-- Folder-level album artist (subset of add_itunes_style_columns.sql).
-- Production music_library_folders never received that migration, so Edit Folder
-- save failed with: could not find the 'album_artist' column in the schema cache.
ALTER TABLE music_library_folders
  ADD COLUMN IF NOT EXISTS album_artist TEXT,
  ADD COLUMN IF NOT EXISTS is_compilation BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS genre TEXT;

CREATE INDEX IF NOT EXISTS idx_mlf_album_artist ON music_library_folders(album_artist);
CREATE INDEX IF NOT EXISTS idx_mlf_genre ON music_library_folders(genre);

UPDATE music_library_folders
SET album_artist = metadata->>'album_artist'
WHERE album_artist IS NULL
  AND metadata ? 'album_artist';

NOTIFY pgrst, 'reload schema';
