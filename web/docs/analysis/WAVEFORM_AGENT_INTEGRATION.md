# 🎵 Waveform Generator Agent - The "Father"

## Overview

The **Waveform Generator Agent** is the most important agent in the team - it's the "Father" that creates the foundation (waveform data) that all other agents can use for their analysis.

## 🎯 Priority: 10 (Highest)

The Waveform Generator runs **first** before all other agents because:
- Waveform data is fundamental for audio analysis
- Other agents can use waveform data for better insights
- It provides the visual representation of the audio
- It's required for the music player visualization

## 🤖 Agent Details

### Capabilities
- **Priority:** 10 (Highest - runs first)
- **Processing Time:** ~2000ms
- **Can Process in Parallel:** No (must run first)
- **Requires Audio File:** Yes
- **Requires MusicBrainz:** No

### What It Does
1. Generates waveform data from audio file
2. Creates 2000 samples of peak data
3. Stores waveform in database
4. Makes waveform available to other agents

## 🔄 Integration

### Pipeline Flow

```
1. Waveform Generator (Priority 10) ← The "Father"
   ↓
2. Technical Analyzer (Priority 9)
   ↓
3. Other agents (Priority 7-4)
```

### Data Flow

```typescript
// Waveform Generator creates:
{
  waveformData: number[],      // 2000 samples
  waveformSamples: number,     // 2000
  sampleRate: number,          // 44100
  version: 2,
  generatedAt: ISO string
}

// Other agents can access:
context.waveformData = {
  data: number[],
  samples: number,
  sampleRate: number
}
```

## 📊 Usage

### Automatic Processing

When a track is uploaded:
1. ✅ Waveform Generator runs first
2. ✅ Creates waveform data
3. ✅ Stores in database
4. ✅ Makes available to other agents

### Manual Trigger

```bash
# Single track with waveform generation
node scripts/run-agent-pipeline.mjs --trackId abc123

# All tracks
node scripts/run-agent-pipeline.mjs --force
```

## 🎨 Benefits

1. **Foundation First** - Waveform created before other analysis
2. **Better Analysis** - Other agents can use waveform data
3. **Instant Visualization** - Waveform ready for music player
4. **Database Storage** - Waveform saved for future use
5. **No Re-generation** - Waveform cached after first creation

## 🔧 Technical Details

### Waveform Format
- **Samples:** 2000 points
- **Format:** Array of numbers (0-1 normalized)
- **Sample Rate:** 44100 Hz
- **Version:** 2 (agent-generated)

### Storage
- **Database Column:** `waveform_data` (JSONB)
- **Samples Column:** `waveform_samples` (INTEGER)
- **Version:** Stored in Sonic DNA metadata

### API Endpoint
- **GET** `/api/audio/waveform?path=<file_path>`
- Returns waveform data from database
- Falls back to generation if not found

## 🚀 Example

```typescript
// Waveform Generator runs first
const waveformResult = await waveformGenerator.process(context)

// Waveform data now available to other agents
context.waveformData = waveformResult.data

// Other agents can use it
const technicalResult = await technicalAnalyzer.process(context)
// technicalResult can now reference context.waveformData
```

## 📝 Notes

- Waveform generation requires the audio file URL
- If waveform exists in database, it's reused
- If not, it's generated during agent pipeline
- Waveform is stored in both `waveform_data` column and Sonic DNA

---

**The Waveform Generator is the "Father" - it creates the foundation that all other agents build upon! 🎵**

