# SERGIK Extracted Systems & Patterns
## From sergik-ableton-cli Repository

This document catalogs reusable systems, APIs, schemas, and patterns that can be leveraged for web development.

---

## 1. OpenAPI Specification

The repository contains a comprehensive OpenAPI 3.1 specification (`sergik_gpt_openapi.yaml`) with 1900+ lines defining:

### Endpoints Available

#### GPT Actions (Natural Language)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/gpt/health` | GET | Health check |
| `/gpt/generate` | POST | Generate MIDI from natural language |
| `/gpt/analyze` | POST | Analyze track with SERGIK DNA |
| `/gpt/transform` | POST | Transform MIDI with natural language |
| `/gpt/catalog/search` | GET | Search catalog with natural language |
| `/gpt/drums` | POST | Generate drums with natural language |

#### Ableton Live Integration
| Category | Endpoints |
|----------|-----------|
| Track Management | create, delete, update, list tracks |
| Device Control | load device/VST, set parameters, toggle |
| Clip Management | create, fire, stop, duplicate, set/get notes |
| Browser/Library | search, load items, hot-swap |
| Session Control | fire scene, set tempo, quantization |
| Transport | play, stop, record, stop all |
| Mixer | set send levels |

#### Generation Endpoints
| Endpoint | Description |
|----------|-------------|
| `/drums/generate` | Generate drum pattern (MIDI) |
| `/drums/generate/audio` | Generate drum audio (WAV) |
| `/generate/chord_progression` | Generate chord progression |
| `/generate/walking_bass` | Generate walking bass |
| `/generate/arpeggios` | Generate arpeggios |
| `/transform/humanize` | Humanize MIDI notes |

---

## 2. Pydantic Schemas (842+ lines)

Complete data models that can be adapted for web forms and API responses:

### Core Entities
```typescript
// TypeScript equivalents for web use

interface Track {
  track_id: string;
  title: string;
  bpm: number;
  key: string;  // Camelot notation
  energy: number;
  style: string;
  rating: number;
  created_at: string;
}

interface MIDINote {
  pitch: number;      // 0-127
  start_time: number; // In beats
  duration: number;   // In beats
  velocity: number;   // 0-127
  mute: number;       // 0 or 1
}

interface SergikDNAMatch {
  sergik_score: number;      // 0-1
  is_sergik_style: boolean;
  match_reasons: string[];
  style_category: string;
}

interface TrackAnalysis {
  track_id: string;
  bpm: number;
  key: string;
  energy: number;
  brightness: number;
  lufs: number;
  harmonic_ratio: number;
  percussive_ratio: number;
  stereo_width: number;
  duration: number;
  sergik_dna: SergikDNAMatch;
}
```

### Audio Analysis Response
```typescript
interface AudioAnalysisResponse {
  status: 'ok' | 'error';
  file: string;
  metadata: {
    bpm: number;
    key: string;
    key_notation: string;
    energy: number;  // 1-10
    duration: number;
    sample_rate: number;
  };
  musicbrainz: {
    status: 'ok' | 'not_found' | 'error';
    artist: string;
    title: string;
    genres: string[];
    tags: string[];
  };
  sergik_dna: {
    overall_match: number;  // 0-100
    scores: Record<string, number>;
    genre_fit: string;
    suggestions: string[];
    compatible_collaborators: string[];
  };
  genre_influence: {
    detected_genres: string[];
    sergik_alignment: Record<string, number>;
    primary_influence: string;
  };
}
```

---

## 3. Drum Generator System

### Supported Genres
```javascript
const DRUM_GENRES = [
  'house',       // Classic 4-on-the-floor
  'tech_house',  // Syncopated hats + percs
  'techno',      // Minimal, hypnotic
  'hiphop',      // Classic boom bap
  'boom_bap',    // Alias for hiphop
  'trap',        // 808s + hi-hat rolls
  'dnb',         // Drum and bass
  'jungle',      // Alias for dnb
  'reggaeton',   // Dembow rhythm
  'dembow',      // Alias for reggaeton
  'ambient',     // Sparse, atmospheric
  'downtempo',   // Alias for ambient
  'lo_fi'        // Lo-fi hip-hop
];
```

### GM Drum Map (MIDI Notes)
```javascript
const GM_DRUM_MAP = {
  kick: 36,
  kick_alt: 35,
  snare: 38,
  snare_rim: 37,
  clap: 39,
  closed_hat: 42,
  open_hat: 46,
  pedal_hat: 44,
  crash: 49,
  ride: 51,
  tom_low: 45,
  tom_mid: 47,
  tom_high: 50,
  cowbell: 56,
  conga_high: 63,
  conga_low: 64,
  shaker: 70,
  clave: 75,
  '808_kick': 36,
  '808_snare': 38,
  '808_hat': 42,
  perc_1: 67,
  perc_2: 68
};
```

### Genre Velocity Ranges
```javascript
const GENRE_VELOCITY = {
  house: { kick: [100, 120], snare: [90, 115], hat: [70, 100] },
  techno: { kick: [110, 127], snare: [100, 120], hat: [60, 90] },
  hiphop: { kick: [100, 127], snare: [95, 120], hat: [50, 85] },
  trap: { kick: [110, 127], snare: [100, 125], hat: [40, 80] },
  dnb: { kick: [105, 125], snare: [100, 120], hat: [65, 95] },
  ambient: { kick: [60, 90], snare: [50, 80], hat: [40, 70] }
};
```

---

## 4. Music Theory System

### Camelot Key Wheel
```javascript
const CAMELOT_KEYS = {
  // Minor keys (A)
  '1A': { name: 'Ab minor', notes: ['Ab', 'B', 'Db', 'Eb', 'Gb'] },
  '2A': { name: 'Eb minor', notes: ['Eb', 'Gb', 'Ab', 'Bb', 'Db'] },
  '3A': { name: 'Bb minor', notes: ['Bb', 'Db', 'Eb', 'F', 'Ab'] },
  '4A': { name: 'F minor', notes: ['F', 'Ab', 'Bb', 'C', 'Eb'] },
  '5A': { name: 'C minor', notes: ['C', 'Eb', 'F', 'G', 'Bb'] },
  '6A': { name: 'G minor', notes: ['G', 'Bb', 'C', 'D', 'F'] },
  '7A': { name: 'D minor', notes: ['D', 'F', 'G', 'A', 'C'] },
  '8A': { name: 'A minor', notes: ['A', 'C', 'D', 'E', 'G'] },
  '9A': { name: 'E minor', notes: ['E', 'G', 'A', 'B', 'D'] },
  '10A': { name: 'B minor', notes: ['B', 'D', 'E', 'F#', 'A'] },
  '11A': { name: 'F# minor', notes: ['F#', 'A', 'B', 'C#', 'E'] },
  '12A': { name: 'Db minor', notes: ['Db', 'E', 'Gb', 'Ab', 'B'] },
  
  // Major keys (B)
  '1B': { name: 'B Major', notes: ['B', 'Db', 'Eb', 'F', 'Ab'] },
  '2B': { name: 'F# Major', notes: ['F#', 'Ab', 'Bb', 'C', 'Eb'] },
  '3B': { name: 'Db Major', notes: ['Db', 'Eb', 'F', 'G', 'Bb'] },
  '4B': { name: 'Ab Major', notes: ['Ab', 'Bb', 'C', 'D', 'F'] },
  '5B': { name: 'Eb Major', notes: ['Eb', 'F', 'G', 'A', 'C'] },
  '6B': { name: 'Bb Major', notes: ['Bb', 'C', 'D', 'E', 'G'] },
  '7B': { name: 'F Major', notes: ['F', 'G', 'A', 'Bb', 'D'] },
  '8B': { name: 'C Major', notes: ['C', 'D', 'E', 'F', 'G'] },
  '9B': { name: 'G Major', notes: ['G', 'A', 'B', 'C', 'D'] },
  '10B': { name: 'D Major', notes: ['D', 'E', 'F#', 'G', 'A'] },
  '11B': { name: 'A Major', notes: ['A', 'B', 'C#', 'D', 'E'] },
  '12B': { name: 'E Major', notes: ['E', 'F#', 'G#', 'A', 'B'] }
};
```

### Chord Intervals (semitones from root)
```javascript
const CHORD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8]
};
```

### Progression Templates
```javascript
const PROGRESSIONS = {
  // House/Techno
  'i-VI-III-VII': { pattern: ['i', 'VI', 'III', 'VII'], genre: 'house', mode: 'minor' },
  'I-V-vi-IV': { pattern: ['I', 'V', 'vi', 'IV'], genre: 'house', mode: 'major' },
  'i-iv-VII-VI': { pattern: ['i', 'iv', 'VII', 'VI'], genre: 'techno', mode: 'minor' },
  'I-IV-I-V': { pattern: ['I', 'IV', 'I', 'V'], genre: 'techno', mode: 'major' },
  
  // Jazz
  'jazz_251': { pattern: ['ii', 'V', 'I'], genre: 'jazz', mode: 'major' },
  'jazz_1625': { pattern: ['I', 'vi', 'ii', 'V'], genre: 'jazz', mode: 'major' },
  
  // Modal
  'modal_dorian': { pattern: ['i', 'IV', 'i', 'IV'], genre: 'modal', mode: 'dorian' },
  'modal_phrygian': { pattern: ['i', 'bII', 'i', 'bVII'], genre: 'modal', mode: 'phrygian' },
  
  // Ambient
  'ambient_pads': { pattern: ['I', 'iii', 'vi', 'IV'], genre: 'ambient', mode: 'major' }
};
```

---

## 5. Genre Mapping System

Maps 150+ genre variations to 4 SERGIK DNA categories:

```javascript
const SERGIK_GENRE_MAPPING = {
  // Hip-Hop Category
  hiphop: ['hip-hop', 'hiphop', 'hip hop', 'rap', 'trap', 'drill', 'grime',
           'boom bap', 'lo-fi', 'lofi', 'east coast', 'west coast',
           'gangsta rap', 'conscious hip hop'],
  
  // House Category  
  house: ['house', 'tech house', 'deep house', 'progressive house',
          'techno', 'minimal techno', 'electronic', 'edm', 'dance',
          'trance', 'dubstep', 'dnb', 'drum and bass', 'breakbeat',
          'juke', 'footwork', 'amapiano', 'gqom'],
  
  // Funk Category
  funk: ['funk', 'p-funk', 'g-funk', 'nu-funk', 'boogie',
         'disco', 'nu-disco', 'reggae', 'dancehall', 'dub',
         'reggaeton', 'latin', 'salsa', 'afrobeat'],
  
  // Soul Category
  soul: ['soul', 'neo-soul', 'r&b', 'rnb', 'motown', 'jazz',
         'smooth jazz', 'acid jazz', 'ambient', 'chillout',
         'trip hop', 'lounge', 'synthwave', 'pop']
};

// BPM-based fallback inference
const BPM_GENRE_INFERENCE = {
  '80-100': 'hip-hop',
  '120-130': 'house',
  '95-115': 'funk',
  'energy <= 5': 'soul'
};
```

---

## 6. UI Presets System

For dropdown menus and form controls:

```javascript
const ANALYSIS_PRESETS = {
  tempo: [
    { value: 80, label: '80 BPM (Hip-Hop)', range: [75, 90] },
    { value: 95, label: '95 BPM (Funk)', range: [90, 110] },
    { value: 124, label: '124 BPM (House)', range: [120, 130] },
    { value: 140, label: '140 BPM (Tech/Trap)', range: [135, 150] }
  ],
  
  keys: [
    { value: '7A', label: '7A (D minor)', notation: 'Dm' },
    { value: '8A', label: '8A (A minor)', notation: 'Am' },
    { value: '10B', label: '10B (D major)', notation: 'D' },
    { value: '11B', label: '11B (A major)', notation: 'A' },
    // ... 24 total keys
  ],
  
  energy: [
    { value: 1, label: 'Energy 1' },
    { value: 2, label: 'Energy 2' },
    // ... 1-10
  ],
  
  genres: [
    { value: 'house', label: 'House' },
    { value: 'tech_house', label: 'Tech House' },
    { value: 'hiphop', label: 'Hip-Hop' },
    { value: 'funk', label: 'Funk' },
    { value: 'soul', label: 'Soul' },
    { value: 'trap', label: 'Trap' },
    { value: 'lofi', label: 'Lo-Fi' },
    { value: 'techno', label: 'Techno' },
    { value: 'disco', label: 'Disco' }
  ]
};
```

---

## 7. GPT Configuration

System instructions and personality for SERGIK AI chatbot:

```json
{
  "name": "SERGIK AI",
  "description": "Official AI assistant for SERGIK - music production, catalog management, and creative collaboration",
  "profile": {
    "artist": "Jordan Caboga",
    "alias": "SERGIK",
    "genres": ["House", "Hip-Hop", "Funk", "Soul"],
    "years_active": "2015-2025"
  },
  "voice": {
    "tone": "Professional but creative",
    "expertise": ["Ableton Live", "audio engineering", "music theory", "beat-making", "mixing"],
    "personality": "Knowledgeable about music production, direct and helpful"
  },
  "capabilities": [
    "Production Advice",
    "Catalog Search", 
    "Collaboration Support",
    "Creative Direction",
    "Ableton Integration"
  ]
}
```

---

## 8. Quality Standards System

```javascript
const QUALITY_TIERS = {
  tier1: {
    name: 'Release Ready',
    sampleRate: 44100,
    bitDepth: 24,
    format: 'WAV',
    status: 'training-ready'
  },
  tier2: {
    name: 'High Quality',
    sampleRate: 44100,
    bitDepth: 16,
    format: ['WAV', 'AIF'],
    status: 'include'
  },
  tier3: {
    name: 'Legacy',
    sampleRate: 44100,
    bitDepth: 16,
    format: 'WAV',
    status: 'validate-only'
  },
  tier4: {
    name: 'Compressed',
    format: ['MP3', 'AAC'],
    status: 'exclude'
  }
};

const MASTERING_TARGETS = {
  integratedLoudness: { target: -12, unit: 'LUFS', tolerance: 2 },
  truePeak: { target: -1.0, unit: 'dBTP', max: 0 },
  dynamicRange: { min: 4, target: 6, unit: 'dB' },
  stereoCorrelation: { min: 0.7 }
};
```

---

## 9. Production Recommendations by Genre

```javascript
const PRODUCTION_RECOMMENDATIONS = {
  house: {
    bpm: { min: 122, max: 126 },
    key: ['10B', '11B'],
    energy: { min: 6, max: 7 }
  },
  hipHop: {
    bpm: { min: 80, max: 88 },
    key: ['7A', '8A'],
    energy: { min: 5, max: 6 }
  },
  funkFusion: {
    bpm: { min: 95, max: 110 },
    key: 'Major keys preferred',
    energy: { target: 6 }
  },
  techHouse: {
    bpm: { min: 124, max: 128 },
    key: ['10B'],
    energy: { min: 6, max: 7 }
  }
};
```

---

## 10. Max for Live Integration Commands

Complete command reference for Ableton Live control:

```javascript
const M4L_COMMANDS = {
  tracks: [
    'create_track <type> [name]',
    'delete_track <index>',
    'arm_track <index> [0/1]',
    'mute_track <index> [0/1]',
    'solo_track <index> [0/1]',
    'set_volume <index> <0-1>',
    'set_pan <index> <-1 to 1>',
    'rename_track <index> <name>',
    'get_tracks'
  ],
  devices: [
    'load_device <track> <name>',
    'load_vst <track> <name>',
    'set_param <track> <device> <param> <value>',
    'get_params <track> <device>',
    'toggle_device <track> <device> [0/1]'
  ],
  clips: [
    'create_clip <track> <slot> [length]',
    'fire_clip <track> <slot>',
    'stop_clip <track> [slot]',
    'duplicate_clip <track> <slot>',
    'set_clip_notes <track> <slot>',
    'get_clip_notes <track> <slot>'
  ],
  session: [
    'fire_scene <index>',
    'set_tempo <bpm>',
    'set_quantization <value>',
    'transport_play',
    'transport_stop',
    'undo',
    'redo'
  ],
  generation: [
    'generate_chords',
    'generate_bass',
    'generate_arps',
    'generate_drums',
    'prompt <natural language>',
    'drum_prompt <text>'
  ]
};
```

---

## Web Development Use Cases

### 1. Interactive BPM/Key Wheel Component
Use the Camelot key data to build a visual key wheel with:
- DJ-friendly key transitions
- Compatible key suggestions
- BPM zone overlays

### 2. AI Chatbot Interface
Use GPT config to build a SERGIK AI chatbot with:
- Production advice
- Catalog search
- Natural language generation prompts

### 3. Audio Analyzer Dashboard
Build UI with:
- File upload for analysis
- BPM/Key/Energy display
- SERGIK DNA match score
- Genre breakdown visualization

### 4. Drum Pattern Generator
Create interactive drum machine with:
- Genre selection
- Swing/humanize controls
- Pattern visualization
- MIDI export

### 5. Chord Progression Builder
Build tool using:
- Progression templates
- Key selection with Camelot wheel
- Voicing options (stabs vs pads)
- Preview playback

### 6. Collaborator Network Graph
Visualize using:
- Top collaborator data
- Project counts
- Influence patterns
- Network connections

---

*Extracted from sergik-ableton-cli repository*
*Last Updated: January 2026*
