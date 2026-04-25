# Add original_bpm Column Migration

## Issue
The `original_bpm` column is missing from your Supabase database, causing errors when updating tracks.

## Quick Fix (2 minutes)

### Step 1: Open Supabase SQL Editor
Go to: https://supabase.com/dashboard/project/utgwlgcejflqxyalnlze/sql/new

### Step 2: Copy and Run Migration
Copy the contents of `web/supabase/migrations/add_original_bpm.sql`:

```sql
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
```

### Step 3: Paste and Run
1. Paste into SQL Editor
2. Click "Run" button
3. Wait for "Success" message

## What This Does
- ✅ Adds `original_bpm` column to store the original detected BPM
- ✅ Preserves original BPM when manual adjustments are made
- ✅ Sets original_bpm for existing tracks that already have bpm
- ✅ Adds index for faster queries

## After Migration
The code will automatically:
- Preserve original_bpm when BPM is manually adjusted
- Track original vs. adjusted BPM for all tracks
- Work with the BPM update API endpoint

## Verification
After running the migration, try updating a track's BPM - it should work without errors!

