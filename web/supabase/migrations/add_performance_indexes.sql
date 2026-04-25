-- Performance Indexes for Music Library
-- Created: 2026-01-27
-- Purpose: Improve query performance for common access patterns

-- Composite index for folder + order queries (most common pattern)
-- Speeds up: SELECT * FROM music_library_tracks WHERE folder_id = ? ORDER BY display_order, title
CREATE INDEX IF NOT EXISTS idx_tracks_folder_order 
ON music_library_tracks(folder_id, display_order, title);

-- Index for audio_file_id lookups
-- Speeds up: JOINs and lookups by audio_file_id
CREATE INDEX IF NOT EXISTS idx_tracks_audio_file_id 
ON music_library_tracks(audio_file_id) 
WHERE audio_file_id IS NOT NULL;

-- Composite index for sonic_dna_cache lookups
-- Speeds up: Cache lookups by track_id or audio_file_id
CREATE INDEX IF NOT EXISTS idx_sonic_dna_cache_track_audio 
ON sonic_dna_cache(track_id, audio_file_id);

-- Index for common folder queries
-- Speeds up: Folder hierarchy queries and ordering
CREATE INDEX IF NOT EXISTS idx_folders_parent_order 
ON music_library_folders(parent_id, display_order, name);
