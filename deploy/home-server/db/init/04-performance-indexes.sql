-- Apply on existing home-server DBs (init scripts only run on first volume create).
-- Safe to re-run: IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_ml_tracks_folder_id ON music_library_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_audio_file_id ON music_library_tracks(audio_file_id);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_folder_display ON music_library_tracks(folder_id, display_order, title);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_archived ON music_library_tracks(is_archived) WHERE is_archived IS DISTINCT FROM true;
CREATE INDEX IF NOT EXISTS idx_ml_tracks_genre ON music_library_tracks(genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ml_tracks_artist ON music_library_tracks(artist);
CREATE INDEX IF NOT EXISTS idx_ml_tracks_sort_artist ON music_library_tracks(sort_artist);
CREATE INDEX IF NOT EXISTS idx_ml_folders_type_hidden ON music_library_folders(type) WHERE hidden IS DISTINCT FROM true AND is_archived IS DISTINCT FROM true;
CREATE INDEX IF NOT EXISTS idx_audio_files_file_path ON audio_files(file_path);
CREATE INDEX IF NOT EXISTS idx_audio_files_file_name ON audio_files(file_name);
CREATE INDEX IF NOT EXISTS idx_audio_files_folder_path ON audio_files(folder_path);

ANALYZE music_library_tracks;
ANALYZE music_library_folders;
ANALYZE audio_files;
