-- Migration: Add original_bpm column to audio_files table
-- This preserves the original detected BPM before any manual adjustments

-- Add the column if it doesn't exist
ALTER TABLE audio_files 
ADD COLUMN IF NOT EXISTS original_bpm INTEGER;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_audio_files_original_bpm ON audio_files(original_bpm);

-- Add comment
COMMENT ON COLUMN audio_files.original_bpm IS 'Original detected BPM before any manual adjustments';

-- Set original_bpm for existing records that have bpm but no original_bpm
UPDATE audio_files 
SET original_bpm = bpm 
WHERE bpm IS NOT NULL AND original_bpm IS NULL;

