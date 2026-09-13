# BPM Detection Status & Recommendations

## Current Implementation

We've implemented a **hybrid BPM detection system** with multiple methods:

### Detection Methods (in priority order):

1. **Title Extraction** ✅ Working
   - Extracts BPM from track titles (e.g., "Track 120bpm")
   - Most reliable when BPM is in filename

2. **Metadata Extraction** ✅ Working  
   - Checks all metadata fields (ID3v2, Vorbis, ASF, etc.)
   - Reliable when files have BPM tags

3. **Audio Analysis** ⚠️ Partially Working
   - **Aubio.js**: Not working in Node.js (requires browser/WASM)
   - **music-tempo**: Failing silently (may need different data format)
   - **Autocorrelation**: Working but has accuracy issues (clustering around 150, 172, 120 BPM)

### Current Issues

- **Autocorrelation algorithm** is detecting subdivisions instead of fundamental tempo
- Results cluster around specific values (150, 172, 120, 149, 99 BPM)
- Many tracks showing similar BPM values that may not be accurate

## Recommended Solutions

### Option 1: Python Microservice (Best Accuracy) ⭐

Create a Python service using `librosa` for professional-grade BPM detection:

```python
# bpm_service.py
import librosa
from fastapi import FastAPI, File, UploadFile
import uvicorn

app = FastAPI()

@app.post("/analyze-bpm")
async def analyze_bpm(file: UploadFile = File(...)):
    # Save temp file
    temp_path = f"/tmp/{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    # Analyze with librosa
    y, sr = librosa.load(temp_path, sr=22050)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    
    return {"bpm": float(tempo)}
```

**Setup:**
```bash
pip install fastapi uvicorn librosa numpy
uvicorn bpm_service:app --port 8000
```

**Pros:**
- Industry-standard accuracy
- Handles complex rhythms well
- Used by professional DJ software

**Cons:**
- Requires Python service
- Additional infrastructure

### Option 2: Manual BPM Entry Interface

Add a UI in the music player to manually set/correct BPM:

- Click on BPM display to edit
- Save corrections to `music-library.json`
- Override automatic detection

### Option 3: Use External API

Integrate with services like:
- **Soundcharts Audio Features API** (if tracks are known)
- **Spotify Web API** (for released tracks)
- **MusicBrainz** (community database)

### Option 4: Accept Current Limitations

- Keep automatic detection as a starting point
- Allow manual correction
- Document that some tracks may need manual BPM entry

## Next Steps

1. **Short-term**: Add manual BPM correction UI
2. **Medium-term**: Set up Python librosa service
3. **Long-term**: Consider commercial API for known tracks

## Current Coverage

- **292/295 tracks** have BPM values (99% coverage)
- **3 tracks** without BPM (will use browser detection when played)
- Most BPMs come from title extraction or previous analysis

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

