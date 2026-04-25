# BPM Analysis Architecture

## Overview

The BPM analysis system has been refactored into a **modular, maintainable architecture** with clear separation of concerns and an improved detection flow.

## Architecture

### 1. **Configuration Module**
Centralized configuration for easy maintenance:
- File paths
- BPM ranges
- Analysis parameters

### 2. **BPM Result Class**
Standardized result object with:
- `bpm`: Detected BPM value
- `source`: Detection method used
- `confidence`: Confidence score (0.0 to 1.0)
- `metadata`: Additional information
- Validation methods

### 3. **Extractors** (Fast, Reliable)
These methods extract BPM from existing data:

#### `TitleExtractor`
- Extracts BPM from track titles
- Multiple pattern matching
- **Confidence: 0.95** (very reliable)
- Returns early if found (fastest method)

#### `MetadataExtractor`
- Extracts BPM from audio file metadata
- Checks all metadata fields (ID3v2, Vorbis, ASF, etc.)
- **Confidence: 0.85-0.9** (reliable)
- Returns early if high confidence

### 4. **Analyzers** (Slower, Less Reliable)
These methods analyze audio data:

#### `AubioAnalyzer`
- Professional-grade tempo detection
- **Confidence: 0.8**
- Requires aubiojs library
- May not work in Node.js (browser-only)

#### `MusicTempoAnalyzer`
- Uses music-tempo library
- Handles tempo subdivisions
- **Confidence: 0.75**
- Works in Node.js

#### `AutocorrelationAnalyzer`
- Custom autocorrelation algorithm
- Onset detection + interval analysis
- **Confidence: 0.6** (fallback)
- Always available

### 5. **Audio Decoder**
- Handles WAV file decoding
- Converts to standard format
- Used by all analyzers

### 6. **BPM Detector (Orchestrator)**
Main class that coordinates detection:

```javascript
const detector = new BPMDetector()
await detector.initialize()

const result = await detector.detect(track, filePath)
```

**Detection Flow:**
1. Try title extraction (fastest, most reliable)
2. Try metadata extraction (fast, reliable)
3. Try audio analysis (slower, less reliable):
   - Aubio (if available)
   - Music-tempo
   - Autocorrelation (fallback)
4. Return best result (highest confidence)

## Benefits of New Architecture

### ✅ **Modularity**
- Each component has a single responsibility
- Easy to add new detection methods
- Easy to modify existing methods

### ✅ **Maintainability**
- Clear structure and organization
- Well-documented code
- Easy to debug

### ✅ **Extensibility**
- Simple to add new extractors/analyzers
- Standardized result format
- Confidence scoring system

### ✅ **Reliability**
- Early returns for fast methods
- Confidence-based result selection
- Multiple fallback methods

### ✅ **Testability**
- Each component can be tested independently
- Mock-friendly structure
- Clear interfaces

## Adding New Detection Methods

### Example: Adding a Python Service Analyzer

```javascript
class PythonServiceAnalyzer {
  static async analyze(filePath) {
    try {
      const response = await fetch('http://localhost:8000/analyze-bpm', {
        method: 'POST',
        body: formData
      })
      const result = await response.json()
      
      if (result.bpm && validateBPM(result.bpm)) {
        return new BPMResult(
          roundBPM(result.bpm),
          'python-librosa',
          0.9, // High confidence
          { service: 'librosa' }
        )
      }
    } catch (error) {
      return null
    }
  }
}

// Add to BPMDetector.detect():
const pythonResult = await PythonServiceAnalyzer.analyze(filePath)
if (pythonResult?.isValid()) {
  results.push(pythonResult)
}
```

## Usage

### Basic Usage
```bash
node scripts/analyze-bpm.mjs
```

### Force Re-analysis
```bash
node scripts/analyze-bpm.mjs --force
```

## Configuration

Edit `CONFIG` object at top of file:
- `BPM_RANGE`: Valid BPM range (30-300)
- `VALID_BPM_RANGE`: Preferred range for audio analysis (60-200)
- `ANALYSIS_DURATION`: Seconds of audio to analyze (60)
- `TARGET_SAMPLE_RATE`: Target sample rate for analysis (11025)

## Result Confidence Levels

- **0.9-1.0**: Very High (title, metadata)
- **0.7-0.9**: High (aubio, metadata)
- **0.6-0.7**: Medium (music-tempo)
- **0.5-0.6**: Low (autocorrelation)

Results are sorted by confidence, highest first.

## Future Improvements

1. **Python Service Integration**: Add librosa-based analyzer
2. **Result Caching**: Cache results to avoid re-analysis
3. **Batch Processing**: Process multiple files in parallel
4. **Progress Reporting**: Better progress indicators
5. **Error Recovery**: Retry failed analyses
6. **Manual Override**: UI for manual BPM correction

