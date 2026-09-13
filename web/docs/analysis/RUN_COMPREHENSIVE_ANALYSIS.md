# Run Comprehensive Sonic DNA Analysis on All Tracks

This guide explains how to run comprehensive Sonic DNA analysis on all tracks in your Supabase database, ensuring all tracks have proper BPMs, complete analysis data, and are linked to the tempo tool.

## Quick Start

### Method 1: Using the Script (Recommended)

```bash
cd web
node scripts/run-comprehensive-analysis-all.mjs
```

**Options:**
- `--force` or `-f`: Regenerate all tracks (even those with existing analysis)
- `--limit N` or `-l N`: Limit to N tracks (useful for testing)

**Examples:**
```bash
# Analyze all tracks missing comprehensive analysis
node scripts/run-comprehensive-analysis-all.mjs

# Regenerate ALL tracks (force)
node scripts/run-comprehensive-analysis-all.mjs --force

# Test with first 10 tracks
node scripts/run-comprehensive-analysis-all.mjs --limit 10
```

### Method 2: Using the API Directly

```bash
# Start analysis (only tracks missing comprehensive analysis)
curl -X POST "http://localhost:3000/api/audio/regenerate-all-sonic-dna"

# Force regenerate ALL tracks
curl -X POST "http://localhost:3000/api/audio/regenerate-all-sonic-dna?force=true"

# Limit to 50 tracks
curl -X POST "http://localhost:3000/api/audio/regenerate-all-sonic-dna?limit=50"

# Check progress
curl "http://localhost:3000/api/audio/regenerate-all-sonic-dna"
```

## What Gets Analyzed

Each track will receive:

### ✅ Technical Analysis
- **BPM**: Properly detected and saved to database
- **Key Signature**: Musical key (e.g., "C major", "A minor")
- **Scale**: Musical scale (Major, Minor, Dorian, etc.)
- **Time Signature**: Rhythm pattern (4/4, 3/4, 6/8, etc.)
- **Energy Level**: Track energy (0-1)
- **Danceability**: Danceability score (0-1)

### ✅ Track Information
- **Description**: Comprehensive track description (50-150 words)
- **Intention**: What's the purpose/intention of this music? (30-100 words)

### ✅ Drum Pattern Analysis
- **Pattern Type**: Four-on-the-floor, breakbeat, etc.
- **Kick/Snare/Hi-Hat Patterns**: Detailed pattern descriptions
- **Genre Drum Styles**: Genre-specific drum characteristics
- **Pattern Recognition**: Detailed pattern analysis

### ✅ Musicology & Cultural
- **Musicological Analysis**: Era, style, production techniques
- **Cultural Analysis**: Regional characteristics, cultural influences

### ✅ Enhanced Genre Analysis
- **Primary Genres**: Main genre classifications
- **Subgenres**: Detailed subgenre breakdown
- **Genre Characteristics**: Specific genre traits
- **Genre Influences**: Musical influences and references

### ✅ MusicBrainz Integration
- **Artist Metadata**: Full artist information
- **Release Information**: Album/release details
- **Regional Data**: Geographic and cultural data

## BPM Auto-Update

The BPM is automatically:
1. **Detected** during comprehensive analysis
2. **Saved** to the database (`bpm` field)
3. **Loaded** automatically when track plays
4. **Linked** to the tempo tool for real-time adjustments

When a track is played:
- The music player checks `currentTrack.bpm` from the database
- If BPM exists, it's immediately available for the tempo tool
- If not found, it falls back to audio analysis (async, non-blocking)

## Monitoring Progress

### Check Progress via API

```bash
curl "http://localhost:3000/api/audio/regenerate-all-sonic-dna"
```

Response:
```json
{
  "total": 379,
  "comprehensive": 150,
  "basic": 50,
  "noAnalysis": 179,
  "needsRegeneration": 179
}
```

### Check Progress in Database

```sql
-- Total tracks
SELECT COUNT(*) FROM audio_files;

-- Tracks with comprehensive analysis
SELECT COUNT(*) FROM audio_files 
WHERE sonic_dna_status = 'completed' 
AND sonic_dna->>'comprehensive' IS NOT NULL;

-- Tracks missing analysis
SELECT COUNT(*) FROM audio_files 
WHERE sonic_dna_status IS NULL OR sonic_dna_status != 'completed';
```

## Requirements

1. **Next.js Server Running**
   ```bash
   cd web
   npm run dev
   ```

2. **AI API Keys Configured**
   - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `.env.local`
   - Required for generating descriptions, intention, and enhanced analysis

3. **Supabase Connection**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Configured in `.env.local`

## Processing Details

- **Batch Size**: 3 tracks processed in parallel (to avoid rate limits)
- **Processing Time**: ~30-60 seconds per track (depends on AI API speed)
- **Background Processing**: Analysis runs in background, doesn't block API

## Troubleshooting

### "Server is not running"
Start the Next.js development server:
```bash
cd web
npm run dev
```

### "No AI API key configured"
Add to `web/.env.local`:
```
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
```

### "No tracks to analyze"
All tracks already have comprehensive analysis. Use `--force` to regenerate:
```bash
node scripts/run-comprehensive-analysis-all.mjs --force
```

### Analysis Failing
Check server logs for detailed error messages. Common issues:
- AI API rate limits (wait and retry)
- MusicBrainz API rate limits (automatic retry)
- Network connectivity issues

## After Analysis

Once analysis is complete:
- ✅ All tracks have proper BPMs saved
- ✅ All tracks have comprehensive Sonic DNA
- ✅ BPM automatically loads when track plays
- ✅ Tempo tool automatically uses database BPM
- ✅ No re-analysis needed unless explicitly requested

## Next Steps

After running analysis:
1. **Verify BPMs**: Check a few tracks to ensure BPMs are correct
2. **Test Playback**: Play tracks and verify BPM loads automatically
3. **Test Tempo Tool**: Adjust tempo and verify it uses the database BPM
4. **Review Analysis**: Check Sonic DNA sections for quality

---

**Note**: This process may take several hours for large libraries (300+ tracks). The analysis runs in the background, so you can continue using the app while it processes.

