# Complete Music Library Analysis & Database Scaffolding

## Overview

This script analyzes your entire music library, extracts all metadata (BPM, key, energy, waveform, etc.), and stores everything in Supabase for instant access. No more buffer issues or re-analysis needed!

## Features

✅ **Waveform Data Extraction** - Extracts waveform data from ALL audio formats (WAV, MP3, FLAC, M4A, etc.)  
✅ **Complete Metadata** - BPM, key signature, energy level, danceability, frequency bands  
✅ **Database Storage** - All data stored in Supabase for instant access  
✅ **Batch Processing** - Processes files in batches to avoid memory issues  
✅ **Multi-Format Support** - Uses FFmpeg (if available) to decode all audio formats  
✅ **Sonic DNA** - Optionally generates AI-powered sonic DNA analysis  

## Prerequisites

1. **Supabase Setup**
   - Ensure your `.env.local` has:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     ```

2. **FFmpeg (Optional but Recommended)**
   - For waveform extraction from MP3, FLAC, M4A, etc.
   - Install: `brew install ffmpeg` (macOS) or `apt-get install ffmpeg` (Linux)
   - If not installed, waveform extraction will only work for WAV files

3. **Node.js Dependencies**
   - All required packages should already be installed
   - Uses: `music-metadata`, `node-wav`, `music-tempo`, `@supabase/supabase-js`

## Usage

### Basic Analysis
```bash
cd web
node scripts/analyze-music-library-complete.mjs
```

### Force Re-analysis
```bash
node scripts/analyze-music-library-complete.mjs --force
```

### Skip Sonic DNA (Faster)
```bash
node scripts/analyze-music-library-complete.mjs --skip-sonic-dna
```

## What Gets Extracted

### Metadata
- Title, Artist, Duration
- File format, size
- BPM (from title, metadata, or audio analysis)
- Key signature (if available in metadata)

### Audio Analysis
- **Waveform Data** - 2000 samples of peak data for instant visualization
- **Frequency Bands** - Energy levels for kicks, snares, hihats, cymbals
- **Energy Level** - Overall track energy (0-1)
- **Danceability** - Calculated from BPM and energy

### Sonic DNA (Optional)
- Emotional analysis
- Musical characteristics
- Historical context
- Regional/cultural influences
- Genre analysis

## Database Schema

All data is stored in the `audio_files` table:

```sql
- waveform_data JSONB          -- Pre-computed waveform peaks
- waveform_samples INTEGER      -- Number of samples (default: 2000)
- waveform_version INTEGER      -- Version of waveform format
- bpm INTEGER                   -- Detected BPM
- key_signature TEXT            -- Musical key
- energy_level DECIMAL(3,2)     -- Energy level (0-1)
- danceability DECIMAL(3,2)     -- Danceability score (0-1)
- frequency_bands JSONB         -- Frequency analysis
- sonic_dna JSONB               -- Complete sonic DNA analysis
- analysis_status TEXT          -- 'pending', 'processing', 'completed', 'failed'
```

## Processing Details

- **Batch Size**: 5 files per batch
- **Concurrency**: Max 3 files analyzed simultaneously
- **Waveform Samples**: 2000 points (configurable)
- **Analysis Duration**: First 60 seconds for BPM detection

## Output

The script provides real-time progress:

```
🎵 Complete Music Library Analysis & Database Scaffolding
============================================================
✅ FFmpeg available - will extract waveforms from all formats
✅ Connected to Supabase
📁 Scanning audio directory: /path/to/audio
✅ Found 150 audio files
📦 Processing 150 files in 30 batches (5 files per batch)
💡 Waveform data will be extracted and stored for instant access

📦 Batch 1/30
   ✅ [1/150] track1.wav - created (waveform)
   ✅ [2/150] track2.mp3 - created (waveform)
   ...

📊 Analysis Complete!
   Total files: 150
   ✅ Created: 120
   🔄 Updated: 30
   ⏭️  Skipped: 0
   ❌ Errors: 0
   📈 Waveforms extracted: 148
   ⚠️  Waveforms failed: 2
   🧬 Sonic DNA generated: 145
```

## Troubleshooting

### Waveform Extraction Fails
- **WAV files**: Should always work
- **Other formats**: Requires FFmpeg
  - Install FFmpeg: `brew install ffmpeg`
  - Verify: `ffmpeg -version`

### Memory Issues
- Script processes in small batches (5 files)
- If issues persist, reduce `BATCH_SIZE` in the script

### Supabase Connection Errors
- Check `.env.local` has correct credentials
- Verify Supabase project is active
- Check network connection

### Analysis Errors
- Files are marked as `failed` in database
- Check `analysis_error` column for details
- Re-run with `--force` to retry failed files

## Performance

- **Speed**: ~2-5 seconds per file (depending on format and size)
- **Waveform Extraction**: 
  - WAV: Instant
  - Other formats: Requires FFmpeg conversion (~1-3 seconds)
- **Database**: All writes are batched for efficiency

## Next Steps

After analysis completes:

1. **Query Waveform Data**:
   ```sql
   SELECT title, waveform_data, waveform_samples 
   FROM audio_files 
   WHERE waveform_data IS NOT NULL;
   ```

2. **Use in Frontend**:
   ```typescript
   const { data } = await supabase
     .from('audio_files')
     .select('waveform_data')
     .eq('id', trackId)
     .single()
   
   // waveform_data is ready to use - no analysis needed!
   const peaks = data.waveform_data
   ```

3. **Filter by Analysis**:
   ```sql
   SELECT * FROM audio_files 
   WHERE analysis_status = 'completed' 
   AND waveform_data IS NOT NULL;
   ```

## Benefits

✅ **Instant Access** - No need to analyze files on-the-fly  
✅ **No Buffer Issues** - Waveform data pre-computed  
✅ **Fast Queries** - All data indexed in database  
✅ **Scalable** - Handles large libraries efficiently  
✅ **Reliable** - Batch processing prevents memory issues  

---

**Ready to analyze your entire library? Run the script and let it work its magic!** 🎵✨

