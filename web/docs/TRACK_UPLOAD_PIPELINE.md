# Track Upload Pipeline

Comprehensive automated pipeline for uploading new tracks with full analysis.

## Overview

The pipeline automatically handles:
1. **Upload** - Stores audio file in Supabase Storage
2. **Metadata Extraction** - BPM, duration, ID3 tags
3. **Waveform Generation** - Visual waveform data
4. **Sonic DNA Analysis** - AI-powered comprehensive analysis
5. **Key Detection** - Musical key signature with Camelot notation
6. **Database Sync** - Creates fully populated track records

## API Endpoints

### Upload New Track

```
POST /api/audio/upload-with-pipeline
```

**Request:** FormData
- `file` (required): Audio file (WAV, MP3, etc.)
- `title` (optional): Track title (auto-parsed from filename)
- `artist` (optional): Artist name (defaults to SERGIK)
- `folderId` (optional): Target folder ID

**Response:**
```json
{
  "success": true,
  "trackId": "track-123456789",
  "audioFileId": "uuid-xxxx",
  "data": {
    "title": "Track Name",
    "artist": "SERGIK",
    "bpm": 128,
    "keySignature": "A minor",
    "energyLevel": 3.5,
    "danceability": 0.85,
    "duration": 240,
    "genres": ["House", "Disco"],
    "sonicDna": { ... },
    "waveform": [ ... ]
  }
}
```

### Reprocess Existing Track

```
POST /api/audio/reprocess-track
```

**Single track:**
```json
{
  "trackId": "track-123456789"
}
```

**Batch processing:**
```json
{
  "trackIds": ["track-1", "track-2", "track-3"]
}
```

### Sync All Data

```
POST /api/music-library/sync-all-data
```

Syncs all analysis data from `audio_files` to `music_library_tracks`.

**Response:**
```json
{
  "success": true,
  "message": "Synced 150 tracks",
  "stats": {
    "total": 500,
    "updated": 150,
    "skipped": 350,
    "fieldsUpdated": {
      "sonic_dna": 120,
      "bpm": 30,
      "key_signature": 45,
      "energy_level": 50,
      "danceability": 50
    }
  }
}
```

## Pipeline Stages

### 1. Metadata Extraction (10%)
- Extracts ID3 tags
- Detects BPM
- Gets duration
- Parses filename for title/artist

### 2. Waveform Generation (20%)
- Creates visual waveform data
- Generates peak samples

### 3. Storage Upload (30%)
- Uploads to Supabase Storage
- Creates `audio_files` record

### 4. Comprehensive Analysis (50%)
- Runs music analysis algorithms
- Detects genre patterns
- Analyzes harmonic content

### 5. Sonic DNA Generation (60%)
- AI-powered analysis via agents
- Genre classification
- Emotional analysis
- Technical breakdown
- Drum pattern detection

### 6. Key Detection (75%)
- Determines musical key
- Validates against standard keys
- Generates Camelot notation

### 7. Database Update (95%)
- Updates `audio_files` with analysis
- Creates/updates `music_library_tracks`
- Syncs all metadata

## Data Fields Populated

| Field | Source | Format |
|-------|--------|--------|
| `bpm` | Metadata/Analysis | Integer (60-200) |
| `key_signature` | AI Analysis | "A minor", "G major", etc. |
| `energy_level` | Sonic DNA | 1-5 scale |
| `danceability` | Sonic DNA | 0-1 scale |
| `duration` | Metadata | Seconds |
| `genres` | Sonic DNA | String array |
| `sonic_dna` | AI Agents | Complete JSON |
| `waveform` | Buffer Analysis | Peak data array |

## Sonic DNA Structure

```json
{
  "drums": {
    "timing": { "groove": "straight", "swingAmount": 0 },
    "pattern": { "complexity": "moderate", "kickPattern": "varied" },
    "genreStyles": ["Electronic"]
  },
  "genres": {
    "primary": ["House", "Disco"],
    "subgenres": ["Deep House"],
    "fusion": "House + Disco fusion"
  },
  "harmony": {
    "keySignature": "A minor",
    "camelot": "8A",
    "scale": "minor",
    "timeSignature": "4/4"
  },
  "technical": {
    "bpm": 124,
    "energyLevel": 3.5,
    "danceability": 0.85
  },
  "emotional": {
    "primaryEmotions": ["energetic", "uplifting"]
  },
  "cultural": {
    "regions": ["European"],
    "culturalInfluences": ["UK House"]
  },
  "_metadata": {
    "processedAt": "2026-01-30T12:00:00Z",
    "pipelineVersion": "2.0",
    "qualityScore": 85
  }
}
```

## Usage Examples

### JavaScript/TypeScript

```typescript
// Upload new track
const formData = new FormData()
formData.append('file', audioFile)
formData.append('folderId', 'folder-discography')

const response = await fetch('/api/audio/upload-with-pipeline', {
  method: 'POST',
  body: formData
})

const result = await response.json()
console.log('Track created:', result.trackId)
console.log('BPM:', result.data.bpm)
console.log('Key:', result.data.keySignature)
```

### Reprocess track

```typescript
const response = await fetch('/api/audio/reprocess-track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ trackId: 'track-123' })
})
```

### Batch sync

```typescript
// Sync all data from audio_files to tracks
await fetch('/api/music-library/sync-all-data', { method: 'POST' })
```

## Error Handling

The pipeline handles errors gracefully:
- Metadata extraction failure: Continues with defaults
- Waveform generation failure: Continues without waveform
- Sonic DNA failure: Creates basic structure
- Key detection failure: Sets to "Unknown"

All errors are logged but don't stop the pipeline.

## Performance

- Single track: ~30-60 seconds (including AI analysis)
- Batch processing: ~15-30 seconds per track
- Sync operation: ~100 tracks per minute
