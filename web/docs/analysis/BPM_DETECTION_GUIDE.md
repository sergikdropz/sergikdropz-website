# BPM Detection System - Enhanced Integration

## Overview

The BPM detection system now uses multiple tools and methods to accurately detect tempo from audio files and metadata.

## Detection Methods (in order of priority)

### 1. **Title Extraction**
- Extracts BPM from track titles using multiple patterns
- Patterns: `120bpm`, `120 BPM`, `BPM: 120`, `(120bpm)`, `[120bpm]`, etc.
- Fast and reliable when BPM is in the filename

### 2. **Metadata Extraction (Enhanced)**
- Checks all possible metadata fields for BPM information:
  - **Standard fields**: `common.bpm`
  - **ID3v2 tags**: `TBPM`, `TXXX BPM`, custom BPM tags
  - **Vorbis comments**: For OGG/FLAC files
  - **ASF tags**: For WMA files
  - **Comments**: Searches comment fields for BPM mentions
  - **Native tags**: All native tag formats

### 3. **Audio Analysis (Multiple Methods)**

The system tries multiple audio analysis methods in order:

#### a. **music-tempo Library**
- Uses the `music-tempo` npm package
- Analyzes first 30 seconds of audio
- Good for detecting steady tempos

#### b. **Custom Autocorrelation Algorithm**
- Improved onset detection
- Interval histogram analysis
- Handles beat subdivisions (eighth notes, triplets, etc.)
- Prefers fundamental tempo over subdivisions

#### c. **Aubio.js** (if available)
- Professional audio analysis library
- More accurate but may require additional setup
- Currently optional

## Usage

### Analyze all tracks:
```bash
cd web
node scripts/analyze-bpm.mjs
```

### Force re-analysis (ignores existing BPM values):
```bash
node scripts/analyze-bpm.mjs --force
```

## Output

The script provides detailed output showing:
- Source of BPM detection (title, metadata, or audio analysis method)
- Progress for each track
- Summary statistics

Example output:
```
✅ [1/5] Track Name - BPM: 120 (from metadata.common.bpm)
✅ [2/5] Track Name - BPM: 150 (from music-tempo)
✅ [3/5] Track Name - BPM: 120 (from autocorrelation)
```

## BPM Storage

Detected BPM values are stored in `music-library.json`:
```json
{
  "title": "Track Name",
  "bpm": 120
}
```

## Integration with Music Player

The music player automatically:
- Reads BPM from track metadata
- Displays original and adjusted BPM (when tempo slider is used)
- Shows BPM in real-time as tempo is adjusted

## Troubleshooting

### BPM values seem incorrect
1. Check if BPM is in the track title - it will be used first
2. Verify metadata has correct BPM tags
3. Try `--force` flag to re-analyze with improved algorithms
4. Some complex rhythms may be difficult to detect automatically

### No BPM detected
- Ensure audio file exists and is readable
- Check file format (WAV files work best for audio analysis)
- Metadata extraction works for all formats

## Future Enhancements

- Integration with external BPM databases (MusicBrainz, etc.)
- Machine learning-based tempo detection
- Real-time BPM detection in browser
- Manual BPM correction interface

