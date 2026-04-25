# Comprehensive Sonic DNA Library Analysis

This guide explains how to re-analyze your entire music library to generate comprehensive Sonic DNA data for all tracks.

## Overview

The Sonic DNA analysis system creates a complete dataset of:
- **Technical Analysis**: BPM, key signature, time signature, energy, danceability
- **Drum Patterns**: Beat patterns, rhythmic characteristics
- **Harmonic Analysis**: Chord progressions, harmonic complexity
- **Genre Classification**: Primary genres, subgenres, genre tags
- **MusicBrainz Integration**: Artist metadata, release information, regional data
- **AI Analysis**: Emotional, psychological, musical, historical, and regional intelligence
- **Cultural Analysis**: Historical context, regional characteristics, cultural influences

Once analyzed, all data is stored in the database, so no refetching is needed unless explicitly requested.

## Methods

### Method 1: Batch API Endpoint (Recommended)

The fastest and most efficient method. Processes all tracks server-side in batches.

#### Start Analysis

```bash
# Start analysis for all tracks without Sonic DNA
curl -X POST "http://localhost:3000/api/audio/analyze-all-sonic-dna"

# Re-analyze all tracks (including those with existing Sonic DNA)
curl -X POST "http://localhost:3000/api/audio/analyze-all-sonic-dna?force=true"

# Analyze with custom batch size
curl -X POST "http://localhost:3000/api/audio/analyze-all-sonic-dna?batchSize=5"

# Limit number of tracks
curl -X POST "http://localhost:3000/api/audio/analyze-all-sonic-dna?limit=100"
```

#### Check Progress

```bash
# Get analysis progress and statistics
curl "http://localhost:3000/api/audio/analyze-all-sonic-dna"
```

Response:
```json
{
  "total": 500,
  "completed": 350,
  "processing": 10,
  "failed": 5,
  "pending": 135,
  "progress": "70.0"
}
```

### Method 2: Node.js Script

Use the provided script for more control and detailed logging.

#### Basic Usage

```bash
cd web
node scripts/analyze-sonic-dna-library.mjs
```

#### Options

```bash
# Re-analyze tracks that already have Sonic DNA
node scripts/analyze-sonic-dna-library.mjs --force

# Limit number of tracks
node scripts/analyze-sonic-dna-library.mjs --limit=50

# Custom batch size (tracks processed in parallel)
node scripts/analyze-sonic-dna-library.mjs --batch-size=5

# Custom delay between batches (milliseconds)
node scripts/analyze-sonic-dna-library.mjs --delay=3000

# Combine options
node scripts/analyze-sonic-dna-library.mjs --force --batch-size=3 --delay=2000
```

#### Example Output

```
🚀 Starting Comprehensive Sonic DNA Library Analysis
   Force reanalyze: false
   Batch size: 3
   Delay between batches: 2000ms

📡 Using batch API endpoint for analysis...

✅ Analysis started!
   Total tracks: 500
   Batch size: 3

📊 Analysis is running in the background.
   Check progress: GET http://localhost:3000/api/audio/analyze-all-sonic-dna

📈 Monitoring progress...
   Progress: 50/500 (10.0%) - Completed: 50, Processing: 3, Failed: 0, Pending: 447
   Progress: 100/500 (20.0%) - Completed: 100, Processing: 3, Failed: 2, Pending: 395
   ...
🎉 Analysis complete!
   ✅ Completed: 495
   ❌ Failed: 5
   📊 Success rate: 99.0%
```

## Configuration

### Environment Variables

Make sure these are set in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key (optional)
ANTHROPIC_API_KEY=your_anthropic_key (optional)
```

### API Rate Limiting

The system includes built-in rate limiting:
- **Batch size**: Default 3 tracks processed in parallel
- **Delay between batches**: Default 2 seconds
- **MusicBrainz API**: Respects rate limits (1 request per second)
- **AI APIs**: Handles rate limits gracefully with retries

## Database Schema

The analysis stores data in the `audio_files` table:

- `sonic_dna` (JSONB): Complete Sonic DNA analysis
- `sonic_dna_status` (TEXT): 'pending', 'processing', 'completed', 'failed'
- `sonic_dna_analyzed_at` (TIMESTAMP): When analysis was completed
- `sonic_dna_error` (TEXT): Error message if analysis failed
- `ai_analysis` (JSONB): AI-generated analysis
- `musicbrainz_id` (TEXT): MusicBrainz artist ID
- `musicbrainz_data` (JSONB): MusicBrainz metadata
- `bpm` (INTEGER): Detected BPM
- `key_signature` (TEXT): Musical key
- `time_signature` (TEXT): Time signature
- `energy_level` (DECIMAL): Energy level (0-1)
- `danceability` (DECIMAL): Danceability score (0-1)
- `frequency_bands` (JSONB): Frequency analysis data
- And more...

## Troubleshooting

### Analysis Fails for Some Tracks

1. Check the `sonic_dna_error` column in the database
2. Verify audio files are accessible via `file_url`
3. Check API keys are valid (OpenAI/Anthropic)
4. Review server logs for detailed error messages

### Slow Analysis

- Reduce `batchSize` to process fewer tracks in parallel
- Increase `delay` between batches
- Check API rate limits (MusicBrainz, OpenAI, Anthropic)

### Re-running Failed Analyses

```bash
# Re-analyze only failed tracks
node scripts/analyze-sonic-dna-library.mjs --force
```

Then filter in the database:
```sql
SELECT * FROM audio_files WHERE sonic_dna_status = 'failed';
```

## Best Practices

1. **Run during off-peak hours**: Analysis is CPU and API-intensive
2. **Monitor progress**: Use the progress endpoint to track completion
3. **Start small**: Test with `--limit=10` first
4. **Check logs**: Monitor server logs for errors
5. **Backup database**: Before re-analyzing with `--force`

## Performance

Typical analysis time per track:
- **Fast tracks** (simple analysis): 5-10 seconds
- **Average tracks**: 15-30 seconds
- **Complex tracks** (with AI analysis): 30-60 seconds

For 500 tracks with batch size 3:
- **Estimated time**: 2-4 hours
- **With AI APIs**: 4-8 hours (depending on rate limits)

## Next Steps

After analysis completes:

1. **Verify data**: Check a few tracks in the database
2. **Review failures**: Investigate any failed analyses
3. **Test frontend**: Verify Sonic DNA displays correctly
4. **Monitor usage**: Track API costs (OpenAI/Anthropic)

The frontend will automatically use cached Sonic DNA data, so no refetching is needed!

