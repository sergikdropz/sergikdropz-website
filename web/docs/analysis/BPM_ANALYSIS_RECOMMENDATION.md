# BPM Analysis - Current Status & Recommendation

## Current Results

After re-analysis, the system shows **heavy clustering** around specific BPM values:
- **143 BPM**: 124 tracks (42%)
- **125 BPM**: 49 tracks (17%)
- **150 BPM**: 30 tracks (10%)
- **137 BPM**: 22 tracks (7%)

This indicates the automatic detection algorithm is finding patterns but **not accurately identifying the fundamental tempo**.

## Why Automatic Detection is Difficult

1. **Complex Rhythms**: Music often has syncopation, varying tempos, and complex patterns
2. **Subdivisions**: Algorithms detect eighth notes, sixteenth notes instead of quarter notes
3. **Transients**: Non-beat transients (cymbals, hi-hats) confuse onset detection
4. **Varying Tempos**: Some tracks have tempo changes throughout

## Recommended Solution: Python Librosa Service

For **professional-grade accuracy**, set up a Python microservice using `librosa`:

### Setup Instructions

1. **Create Python service** (`bpm_service.py`):

```python
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import librosa
import numpy as np
import uvicorn
import tempfile
import os

app = FastAPI()

# Allow CORS for Node.js to call
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze-bpm")
async def analyze_bpm(file: UploadFile = File(...)):
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Load audio with librosa (handles resampling automatically)
            y, sr = librosa.load(tmp_path, sr=22050, duration=60)  # Analyze first 60 seconds
            
            # Use librosa's beat tracking (industry standard)
            tempo, beats = librosa.beat.beat_track(
                y=y, 
                sr=sr,
                units='time',
                start_bpm=120.0,
                std_bpm=1.0
            )
            
            # Round to nearest integer
            bpm = round(float(tempo))
            
            # Validate BPM is in reasonable range
            if bpm < 60 or bpm > 200:
                # Try alternative method
                onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
                onset_times = librosa.frames_to_time(onset_frames, sr=sr)
                
                if len(onset_times) > 4:
                    intervals = np.diff(onset_times)
                    # Filter reasonable intervals (0.2s to 2.0s = 30-300 BPM)
                    intervals = intervals[(intervals >= 0.2) & (intervals <= 2.0)]
                    if len(intervals) > 0:
                        avg_interval = np.median(intervals)
                        bpm = round(60 / avg_interval)
            
            return {
                "bpm": bpm if 60 <= bpm <= 200 else None,
                "method": "librosa",
                "success": True
            }
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        return {
            "bpm": None,
            "error": str(e),
            "success": False
        }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

2. **Install dependencies**:

```bash
pip install fastapi uvicorn librosa numpy
```

3. **Run service**:

```bash
python bpm_service.py
```

4. **Update `analyze-bpm.mjs`** to call Python service:

```javascript
async function detectBPMWithPythonService(filePath) {
  try {
    const FormData = (await import('form-data')).default
    const fs = await import('fs')
    
    const form = new FormData()
    form.append('file', fs.createReadStream(filePath))
    
    const response = await fetch('http://localhost:8000/analyze-bpm', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    })
    
    const result = await response.json()
    
    if (result.success && result.bpm) {
      return result.bpm
    }
  } catch (error) {
    // Python service not available
  }
  return null
}
```

## Alternative: Manual Correction Interface

If Python service isn't feasible, add a UI for manual BPM correction:

1. Click on BPM display in music player
2. Enter correct BPM
3. Save to `music-library.json`
4. Override automatic detection

## Current System Status

✅ **Working:**
- Title extraction (most reliable)
- Metadata extraction
- Browser-side detection with Realtime BPM Analyzer
- System architecture ready for improvements

⚠️ **Needs Improvement:**
- Automatic audio analysis accuracy
- Currently clustering around 143, 125, 150 BPM

## Next Steps

1. **Short-term**: Use current system with manual corrections as needed
2. **Medium-term**: Set up Python librosa service for accurate detection
3. **Long-term**: Consider commercial API for known tracks (Spotify, Soundcharts)

## Testing

To test current detection:
```bash
cd web
node scripts/analyze-bpm.mjs --force
```

To check BPM distribution:
```bash
node -e "const data = require('./data/music-library.json'); ..."
```

