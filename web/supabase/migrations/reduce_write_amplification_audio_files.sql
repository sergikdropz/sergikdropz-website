-- Reduce Disk IO write amplification on audio_files / music_library_tracks.
--
-- Measured on 2026-09-10 (project bjzevrsruixsbypybyiy):
--   * ~2.2 GB of ~3.9 GB total WAL came from four UPDATE statements that rewrite
--     audio_files.sonic_dna. A single-row update of an 18 kB JSONB value produced
--     311 kB of WAL (~17x amplification), with 23 full-page images per call.
--   * Only 584 of 8358 updates to audio_files were HOT, so almost every write
--     re-inserted an index tuple into all 14 indexes on the table.
--   * idx_audio_files_waveform is a GIN index over waveform_data, a JSONB array of
--     2000 numbers per row. That is ~2000 index entries per row (43 MB for 401 rows)
--     re-inserted on every non-HOT update, and it has never been scanned.

-- 1. The dominant write amplifier: unused GIN index over 2000-element peak arrays.
DROP INDEX IF EXISTS public.idx_audio_files_waveform;

-- 2. Exact duplicate of idx_track_summary_folder (same table, same column).
DROP INDEX IF EXISTS public.idx_music_library_tracks_folder_id;

-- 3. Leave free space in each page so sonic_dna-only rewrites can take the HOT path
--    and skip index maintenance entirely. Both tables are tiny in the heap
--    (audio_files 1000 kB, music_library_tracks 472 kB) so the space cost is trivial.
ALTER TABLE public.audio_files SET (fillfactor = 70);
ALTER TABLE public.music_library_tracks SET (fillfactor = 70);

-- Existing pages keep their old packing until rewritten; this makes it immediate.
VACUUM FULL public.audio_files;
VACUUM FULL public.music_library_tracks;
ANALYZE public.audio_files;
ANALYZE public.music_library_tracks;
