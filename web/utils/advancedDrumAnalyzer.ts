/**
 * Advanced Drum Pattern Analyzer
 * 
 * Comprehensive drum beat genre and style detection using:
 * - Kick and snare pattern analysis
 * - Percussion cadence and rhythm detection
 * - Half-time detection (hip hop breaks, dnb, hardcore)
 * - Bassline style analysis combined with drum data
 * - Integration with SERGIK AI, MusicBrainz, AcoustID
 * 
 * Based on SERGIK DNA profile and music production knowledge.
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface DrumPatternSignature {
  name: string
  kickPattern: KickPattern
  snarePattern: SnarePattern
  hihatPattern: HihatPattern
  cadence: PercussionCadence
  timingFeel: TimingFeel
  bpmRange: { min: number; max: number; typical: number }
  swingRange: { min: number; max: number }
  characteristics: string[]
  subgenres: string[]
}

export interface KickPattern {
  type: KickPatternType
  positions: number[]  // Beat positions (1-16 for 16th notes)
  velocity: 'consistent' | 'dynamic' | 'accent-heavy'
  subBass: boolean     // 808 sub bass present
  sidechain: boolean   // Sidechained to other elements
  character: KickCharacter[]
}

export type KickPatternType = 
  | 'four-on-the-floor'    // 1, 5, 9, 13
  | 'boom-bap'             // 1, 7, 9, 13 (syncopated)
  | '808-trap'             // Sparse, sliding
  | 'breakbeat'            // Syncopated, complex
  | 'two-step'             // 1, 9 (half-time feel)
  | 'dembow'               // Reggaeton pattern
  | 'industrial'           // Distorted, heavy
  | 'minimal'              // Sparse
  | 'jungle'               // Chopped breaks
  | 'halftime-dnb'         // DnB at half speed
  | 'hardcore'             // Gabber style
  | 'custom'

export type KickCharacter = 
  | 'punchy' | 'deep' | '808-sub' | 'distorted' | 'acoustic' 
  | 'synthetic' | 'booming' | 'tight' | 'loose' | 'clicky'
  | 'thumpy' | 'layered' | 'filtered' | 'saturated' | 'sampled' | 'chaotic'

export interface SnarePattern {
  type: SnarePatternType
  positions: number[]     // Beat positions
  ghostNotes: number[]    // Ghost note positions
  rolls: SnareRollType[]  // Roll patterns
  rimshots: boolean       // Uses rim shots
  character: SnareCharacter[]
}

export type SnarePatternType = 
  | 'backbeat'             // 5, 13 (2 and 4)
  | 'halftime-backbeat'    // 9 only (3 in halftime)
  | 'syncopated'           // Complex placement
  | 'breakbeat'            // Chopped, complex
  | 'trap-rolls'           // With rolls and buildups
  | 'boom-bap-crack'       // Snappy, vinyl-style
  | 'clap-layered'         // Clap + snare combo
  | 'minimal'              // Sparse or none
  | 'industrial'           // Harsh, distorted
  | 'acoustic'             // Natural drum kit
  | 'custom'

export type SnareRollType = 
  | 'none' | '16th-fill' | '32nd-fill' | 'triplet-roll'
  | 'buildup' | 'machine-gun' | 'flam' | 'drag'

export type SnareCharacter = 
  | 'snappy' | 'fat' | 'crispy' | 'layered' | 'vinyl' 
  | 'tight' | 'loose' | 'compressed' | 'reverbed' | 'gated'
  | 'clap' | 'rim' | 'brush' | 'processed' | 'acoustic' | 'chaotic'

export interface HihatPattern {
  type: HihatPatternType
  positions: number[]      // Main positions
  openPositions: number[]  // Open hi-hat positions
  velocity: HihatVelocity
  rhythm: HihatRhythm
  character: HihatCharacter[]
}

export type HihatPatternType = 
  | 'straight-8ths'        // 1, 3, 5, 7, 9, 11, 13, 15
  | 'straight-16ths'       // All 16 positions
  | 'offbeat-8ths'         // 3, 7, 11, 15 (offbeat)
  | 'triplet-flow'         // Trap triplet rolls
  | 'swing-hats'           // Swung timing
  | 'sparse-minimal'       // Few hits
  | 'shuffle'              // Shuffled feel
  | 'breakbeat-chops'      // Chopped from breaks
  | 'ride-pattern'         // Ride cymbal style
  | 'shaker'               // Shaker replacement
  | 'custom'

export type HihatVelocity = 
  | 'consistent' | 'accent-downbeat' | 'accent-offbeat' 
  | 'dynamic' | 'humanized' | 'robotic'

export type HihatRhythm = 
  | 'straight' | 'swing' | 'shuffle' | 'triplet' 
  | 'compound' | 'polyrhythmic'

export type HihatCharacter = 
  | 'crispy' | 'dark' | 'bright' | 'closed' | 'open' 
  | 'trashy' | 'electronic' | 'acoustic' | 'filtered' | 'tight'

export interface PercussionCadence {
  density: 'sparse' | 'moderate' | 'dense' | 'hyperdense'
  complexity: number   // 1-10 scale
  syncopation: number  // 0-100%
  polyrhythm: boolean
  layers: number       // Number of percussion layers
  groove: GrooveType
}

export type GrooveType = 
  | 'straight' | 'swing' | 'shuffle' | 'lazy' | 'pushed'
  | 'behind-the-beat' | 'on-top' | 'syncopated' | 'hypnotic'

export interface TimingFeel {
  type:
    | 'full-time'
    | 'half-time'
    | 'double-time'
    | 'variable'
    | 'broken'
    | 'swing'
    | 'off-grid'
    | 'polymetric'
    | 'garage'
    | 'sparse'
  confidence: number  // 0-100%
  indicators: string[]
  effectiveBpm: number
}

export interface BasslineAnalysis {
  type: BasslineType
  character: string[]
  rhythm: BasslineRhythm
  slides: boolean        // 808 slides
  subHarmonics: boolean  // Sub bass content
  syncopation: number    // 0-100%
}

export type BasslineType = 
  | '808-sub' | '808-sliding' | 'synth-bass' | 'reese' | 'neuro'
  | 'walking' | 'driving' | 'melodic' | 'minimal' | 'acid'
  | 'wobble' | 'sampled' | 'live' | 'filtered'

export type BasslineRhythm = 
  | 'root-notes' | 'octave-jumps' | 'syncopated' | 'follows-kick'
  | 'melodic' | 'rolling' | 'sparse' | 'continuous'

export interface DrumAnalysisResult {
  // Pattern detection
  kickPattern: KickPattern
  snarePattern: SnarePattern
  hihatPattern: HihatPattern
  
  // Cadence analysis
  cadence: PercussionCadence
  
  // Timing analysis
  timing: TimingFeel
  
  // Bassline integration
  bassline: BasslineAnalysis | null
  
  // Genre classification
  drumGenre: {
    primary: string
    secondary: string[]
    subgenres: string[]
    confidence: number
  }
  
  // Overall characteristics
  characteristics: string[]
  
  // Pattern signature match
  signatureMatch: {
    name: string
    similarity: number
    matchedFeatures: string[]
  } | null
  
  // Detailed description
  description: string
}

// =============================================================================
// Drum Pattern Signatures Database
// =============================================================================

export const DRUM_PATTERN_SIGNATURES: Record<string, DrumPatternSignature> = {
  // House Family
  classic_house: {
    name: 'Classic House',
    kickPattern: {
      type: 'four-on-the-floor',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: true,
      character: ['punchy', 'tight']
    },
    snarePattern: {
      type: 'backbeat',
      positions: [5, 13],
      ghostNotes: [],
      rolls: ['none'],
      rimshots: false,
      character: ['crispy', 'clap']
    },
    hihatPattern: {
      type: 'offbeat-8ths',
      positions: [3, 7, 11, 15],
      openPositions: [7, 15],
      velocity: 'accent-offbeat',
      rhythm: 'straight',
      character: ['crispy', 'open']
    },
    cadence: {
      density: 'moderate',
      complexity: 4,
      syncopation: 20,
      polyrhythm: false,
      layers: 3,
      groove: 'straight'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['4/4 kick', 'offbeat hats'], effectiveBpm: 125 },
    bpmRange: { min: 118, max: 132, typical: 125 },
    swingRange: { min: 0, max: 30 },
    characteristics: ['four-on-the-floor', 'offbeat hats', 'clap backbeat', 'driving'],
    subgenres: ['Deep House', 'Classic House', 'Chicago House', 'Garage House', 'Vocal House']
  },

  tech_house: {
    name: 'Tech House',
    kickPattern: {
      type: 'four-on-the-floor',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: true,
      character: ['punchy', 'tight', 'clicky']
    },
    snarePattern: {
      type: 'backbeat',
      positions: [5, 13],
      ghostNotes: [3, 11],
      rolls: ['none'],
      rimshots: true,
      character: ['tight', 'crispy']
    },
    hihatPattern: {
      type: 'straight-16ths',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [],
      velocity: 'dynamic',
      rhythm: 'straight',
      character: ['crispy', 'electronic']
    },
    cadence: {
      density: 'dense',
      complexity: 6,
      syncopation: 35,
      polyrhythm: false,
      layers: 4,
      groove: 'hypnotic'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['driving 16ths', 'rolling groove'], effectiveBpm: 126 },
    bpmRange: { min: 122, max: 130, typical: 126 },
    swingRange: { min: 0, max: 20 },
    characteristics: ['rolling 16th hats', 'minimal but groovy', 'hypnotic', 'club-focused'],
    subgenres: ['Minimal Tech House', 'Groovy Tech House', 'Bass House', 'Tribal Tech']
  },

  // Hip-Hop Family
  boom_bap: {
    name: 'Boom Bap',
    kickPattern: {
      type: 'boom-bap',
      positions: [1, 7, 9, 13],
      velocity: 'dynamic',
      subBass: false,
      sidechain: false,
      character: ['booming', 'punchy', 'acoustic']
    },
    snarePattern: {
      type: 'boom-bap-crack',
      positions: [5, 13],
      ghostNotes: [3, 11, 15],
      rolls: ['none'],
      rimshots: false,
      character: ['snappy', 'vinyl', 'crispy']
    },
    hihatPattern: {
      type: 'swing-hats',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [7, 15],
      velocity: 'humanized',
      rhythm: 'swing',
      character: ['crispy', 'acoustic']
    },
    cadence: {
      density: 'moderate',
      complexity: 5,
      syncopation: 60,
      polyrhythm: false,
      layers: 3,
      groove: 'swing'
    },
    timingFeel: { type: 'half-time', confidence: 95, indicators: ['swung feel', 'laid-back groove'], effectiveBpm: 90 },
    bpmRange: { min: 85, max: 98, typical: 92 },
    swingRange: { min: 50, max: 70 },
    characteristics: ['swung groove', 'vinyl crackle', 'sampled breaks', 'head-nodding'],
    subgenres: ['Golden Era', 'East Coast', 'Jazz Rap', 'Underground Hip-Hop', 'Conscious Hip-Hop']
  },

  trap: {
    name: 'Trap',
    kickPattern: {
      type: '808-trap',
      positions: [1, 9, 11],
      velocity: 'dynamic',
      subBass: true,
      sidechain: false,
      character: ['808-sub', 'deep', 'distorted']
    },
    snarePattern: {
      type: 'trap-rolls',
      positions: [5, 13],
      ghostNotes: [],
      rolls: ['triplet-roll', 'machine-gun', 'buildup'],
      rimshots: false,
      character: ['snappy', 'layered', 'processed']
    },
    hihatPattern: {
      type: 'triplet-flow',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [8, 16],
      velocity: 'dynamic',
      rhythm: 'triplet',
      character: ['crispy', 'electronic']
    },
    cadence: {
      density: 'dense',
      complexity: 7,
      syncopation: 50,
      polyrhythm: true,
      layers: 4,
      groove: 'syncopated'
    },
    timingFeel: { type: 'half-time', confidence: 98, indicators: ['808 slides', 'triplet hats', 'sparse kick'], effectiveBpm: 140 },
    bpmRange: { min: 130, max: 170, typical: 145 },
    swingRange: { min: 0, max: 20 },
    characteristics: ['triplet hi-hats', '808 bass slides', 'snare rolls', 'dark atmosphere'],
    subgenres: ['Melodic Trap', 'Hard Trap', 'Drill', 'Phonk', 'Latin Trap', 'UK Drill']
  },

  lofi_hiphop: {
    name: 'Lo-Fi Hip-Hop',
    kickPattern: {
      type: 'boom-bap',
      positions: [1, 7, 9],
      velocity: 'dynamic',
      subBass: false,
      sidechain: false,
      character: ['booming', 'loose', 'filtered']
    },
    snarePattern: {
      type: 'boom-bap-crack',
      positions: [5, 13],
      ghostNotes: [3, 11],
      rolls: ['none'],
      rimshots: false,
      character: ['vinyl', 'loose', 'reverbed']
    },
    hihatPattern: {
      type: 'swing-hats',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [7],
      velocity: 'humanized',
      rhythm: 'swing',
      character: ['dark', 'filtered', 'acoustic']
    },
    cadence: {
      density: 'sparse',
      complexity: 3,
      syncopation: 45,
      polyrhythm: false,
      layers: 2,
      groove: 'lazy'
    },
    timingFeel: { type: 'half-time', confidence: 95, indicators: ['slow tempo', 'swung feel', 'relaxed'], effectiveBpm: 80 },
    bpmRange: { min: 70, max: 90, typical: 80 },
    swingRange: { min: 40, max: 65 },
    characteristics: ['dusty vinyl', 'warm samples', 'lazy groove', 'nostalgic'],
    subgenres: ['Chillhop', 'Study Beats', 'Jazzy Lo-Fi', 'Bedroom Pop', 'Lo-Fi Boom Bap']
  },

  // Drum & Bass Family
  liquid_dnb: {
    name: 'Liquid Drum & Bass',
    kickPattern: {
      type: 'breakbeat',
      positions: [1, 7, 9, 15],
      velocity: 'dynamic',
      subBass: true,
      sidechain: true,
      character: ['punchy', 'tight', 'synthetic']
    },
    snarePattern: {
      type: 'breakbeat',
      positions: [5, 13],
      ghostNotes: [3, 7, 11, 15],
      rolls: ['16th-fill'],
      rimshots: false,
      character: ['snappy', 'layered', 'compressed']
    },
    hihatPattern: {
      type: 'breakbeat-chops',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [4, 8, 12, 16],
      velocity: 'dynamic',
      rhythm: 'compound',
      character: ['crispy', 'electronic']
    },
    cadence: {
      density: 'dense',
      complexity: 8,
      syncopation: 70,
      polyrhythm: true,
      layers: 5,
      groove: 'syncopated'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['fast tempo', 'rolling breaks'], effectiveBpm: 174 },
    bpmRange: { min: 170, max: 178, typical: 174 },
    swingRange: { min: 0, max: 15 },
    characteristics: ['rolling breaks', 'soulful', 'musical', 'uplifting'],
    subgenres: ['Liquid Funk', 'Soulful DnB', 'Vocal DnB', 'Atmospheric DnB']
  },

  neurofunk: {
    name: 'Neurofunk',
    kickPattern: {
      type: 'breakbeat',
      positions: [1, 5, 9, 11, 15],
      velocity: 'dynamic',
      subBass: true,
      sidechain: true,
      character: ['punchy', 'distorted', 'synthetic']
    },
    snarePattern: {
      type: 'breakbeat',
      positions: [5, 13],
      ghostNotes: [3, 7, 11, 15],
      rolls: ['32nd-fill', 'machine-gun'],
      rimshots: false,
      character: ['snappy', 'processed', 'compressed']
    },
    hihatPattern: {
      type: 'breakbeat-chops',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [8, 16],
      velocity: 'robotic',
      rhythm: 'compound',
      character: ['electronic', 'crispy', 'dark']
    },
    cadence: {
      density: 'hyperdense',
      complexity: 9,
      syncopation: 80,
      polyrhythm: true,
      layers: 6,
      groove: 'syncopated'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['fast tempo', 'complex breaks', 'neuro bass'], effectiveBpm: 174 },
    bpmRange: { min: 172, max: 178, typical: 174 },
    swingRange: { min: 0, max: 10 },
    characteristics: ['aggressive', 'technical', 'neuro bass', 'sci-fi textures'],
    subgenres: ['Dark DnB', 'Minimal Neuro', 'Tech Step', 'Industrial DnB']
  },

  jungle: {
    name: 'Jungle',
    kickPattern: {
      type: 'jungle',
      positions: [1, 7, 9, 13],
      velocity: 'dynamic',
      subBass: true,
      sidechain: false,
      character: ['deep', 'booming', 'sampled']
    },
    snarePattern: {
      type: 'breakbeat',
      positions: [5, 13],
      ghostNotes: [3, 7, 11, 15],
      rolls: ['16th-fill'],
      rimshots: false,
      character: ['snappy', 'vinyl', 'acoustic']
    },
    hihatPattern: {
      type: 'breakbeat-chops',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [7, 15],
      velocity: 'humanized',
      rhythm: 'swing',
      character: ['acoustic', 'trashy']
    },
    cadence: {
      density: 'dense',
      complexity: 8,
      syncopation: 75,
      polyrhythm: true,
      layers: 4,
      groove: 'swing'
    },
    timingFeel: { type: 'full-time', confidence: 90, indicators: ['chopped breaks', 'amen break', 'ragga influence'], effectiveBpm: 165 },
    bpmRange: { min: 160, max: 175, typical: 165 },
    swingRange: { min: 20, max: 40 },
    characteristics: ['chopped breaks', 'amen break', 'ragga influence', 'deep sub'],
    subgenres: ['Ragga Jungle', 'Old School Jungle', 'Darkside Jungle', 'Intelligent Jungle']
  },

  halftime_dnb: {
    name: 'Halftime DnB',
    kickPattern: {
      type: 'halftime-dnb',
      positions: [1, 9],
      velocity: 'dynamic',
      subBass: true,
      sidechain: true,
      character: ['deep', '808-sub', 'saturated']
    },
    snarePattern: {
      type: 'halftime-backbeat',
      positions: [9],
      ghostNotes: [5, 13],
      rolls: ['triplet-roll'],
      rimshots: false,
      character: ['fat', 'processed', 'reverbed']
    },
    hihatPattern: {
      type: 'triplet-flow',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [7, 15],
      velocity: 'dynamic',
      rhythm: 'triplet',
      character: ['crispy', 'electronic']
    },
    cadence: {
      density: 'moderate',
      complexity: 7,
      syncopation: 65,
      polyrhythm: true,
      layers: 4,
      groove: 'behind-the-beat'
    },
    timingFeel: { type: 'half-time', confidence: 98, indicators: ['snare on 3', 'sparse kick', 'heavy bass'], effectiveBpm: 87 },
    bpmRange: { min: 170, max: 180, typical: 174 },
    swingRange: { min: 10, max: 30 },
    characteristics: ['half-time feel', 'heavy bass', 'trap influence', 'experimental'],
    subgenres: ['Halftime', 'Trapstep', 'Hybrid Trap', 'Experimental DnB']
  },

  // Techno Family
  peak_time_techno: {
    name: 'Peak Time Techno',
    kickPattern: {
      type: 'four-on-the-floor',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: true,
      character: ['punchy', 'distorted', 'tight']
    },
    snarePattern: {
      type: 'minimal',
      positions: [5, 13],
      ghostNotes: [],
      rolls: ['none'],
      rimshots: false,
      character: ['tight', 'processed']
    },
    hihatPattern: {
      type: 'straight-16ths',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [],
      velocity: 'robotic',
      rhythm: 'straight',
      character: ['electronic', 'dark']
    },
    cadence: {
      density: 'dense',
      complexity: 5,
      syncopation: 25,
      polyrhythm: false,
      layers: 3,
      groove: 'hypnotic'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['driving kick', 'industrial feel'], effectiveBpm: 135 },
    bpmRange: { min: 130, max: 145, typical: 135 },
    swingRange: { min: 0, max: 10 },
    characteristics: ['driving', 'dark', 'industrial', 'relentless'],
    subgenres: ['Industrial Techno', 'Hard Techno', 'Rave Techno', 'Warehouse Techno']
  },

  minimal_techno: {
    name: 'Minimal Techno',
    kickPattern: {
      type: 'minimal',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: true,
      character: ['tight', 'clicky', 'synthetic']
    },
    snarePattern: {
      type: 'minimal',
      positions: [5, 13],
      ghostNotes: [3, 7, 11],
      rolls: ['none'],
      rimshots: true,
      character: ['tight', 'crispy']
    },
    hihatPattern: {
      type: 'sparse-minimal',
      positions: [3, 7, 11, 15],
      openPositions: [],
      velocity: 'dynamic',
      rhythm: 'straight',
      character: ['electronic', 'crispy']
    },
    cadence: {
      density: 'sparse',
      complexity: 4,
      syncopation: 30,
      polyrhythm: false,
      layers: 2,
      groove: 'hypnotic'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['sparse elements', 'space', 'repetitive'], effectiveBpm: 128 },
    bpmRange: { min: 125, max: 135, typical: 128 },
    swingRange: { min: 0, max: 25 },
    characteristics: ['sparse', 'hypnotic', 'space', 'micro-variations'],
    subgenres: ['Microhouse', 'Minimal House', 'Click House', 'Glitch Minimal']
  },

  // Hardcore Family
  gabber: {
    name: 'Gabber/Hardcore',
    kickPattern: {
      type: 'hardcore',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: false,
      character: ['distorted', 'booming', 'saturated']
    },
    snarePattern: {
      type: 'backbeat',
      positions: [5, 13],
      ghostNotes: [],
      rolls: ['machine-gun'],
      rimshots: false,
      character: ['snappy', 'processed', 'layered']
    },
    hihatPattern: {
      type: 'straight-16ths',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [8, 16],
      velocity: 'robotic',
      rhythm: 'straight',
      character: ['bright', 'electronic']
    },
    cadence: {
      density: 'hyperdense',
      complexity: 6,
      syncopation: 20,
      polyrhythm: false,
      layers: 4,
      groove: 'straight'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['very fast', 'distorted kick', 'aggressive'], effectiveBpm: 165 },
    bpmRange: { min: 150, max: 200, typical: 165 },
    swingRange: { min: 0, max: 5 },
    characteristics: ['distorted kicks', 'aggressive', 'very fast', 'rave culture'],
    subgenres: ['Gabber', 'Industrial Hardcore', 'Speedcore', 'Happy Hardcore', 'UK Hardcore']
  },

  breakcore: {
    name: 'Breakcore',
    kickPattern: {
      type: 'breakbeat',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      velocity: 'dynamic',
      subBass: false,
      sidechain: false,
      character: ['distorted', 'chaotic', 'sampled']
    },
    snarePattern: {
      type: 'breakbeat',
      positions: [3, 5, 7, 9, 11, 13, 15],
      ghostNotes: [1, 2, 4, 6, 8, 10, 12, 14, 16],
      rolls: ['machine-gun', '32nd-fill'],
      rimshots: false,
      character: ['snappy', 'chaotic', 'processed']
    },
    hihatPattern: {
      type: 'breakbeat-chops',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [4, 8, 12, 16],
      velocity: 'dynamic',
      rhythm: 'compound',
      character: ['electronic', 'trashy']
    },
    cadence: {
      density: 'hyperdense',
      complexity: 10,
      syncopation: 90,
      polyrhythm: true,
      layers: 6,
      groove: 'syncopated'
    },
    timingFeel: { type: 'variable', confidence: 80, indicators: ['chaotic', 'tempo changes', 'complex edits'], effectiveBpm: 180 },
    bpmRange: { min: 160, max: 280, typical: 180 },
    swingRange: { min: 0, max: 50 },
    characteristics: ['chaotic', 'chopped breaks', 'experimental', 'glitchy'],
    subgenres: ['IDM Breakcore', 'Drill and Bass', 'Noise Breakcore', 'Mashcore']
  },

  // Other Genres
  uk_garage: {
    name: 'UK Garage / 2-Step',
    kickPattern: {
      type: 'two-step',
      positions: [1, 9, 11],
      velocity: 'dynamic',
      subBass: true,
      sidechain: false,
      character: ['punchy', 'deep', 'tight']
    },
    snarePattern: {
      type: 'syncopated',
      positions: [5, 11],
      ghostNotes: [3, 7, 15],
      rolls: ['none'],
      rimshots: true,
      character: ['snappy', 'rim', 'crispy']
    },
    hihatPattern: {
      type: 'shuffle',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [3, 11],
      velocity: 'humanized',
      rhythm: 'shuffle',
      character: ['crispy', 'bright']
    },
    cadence: {
      density: 'moderate',
      complexity: 6,
      syncopation: 65,
      polyrhythm: false,
      layers: 4,
      groove: 'shuffle'
    },
    timingFeel: { type: 'full-time', confidence: 90, indicators: ['skippy feel', 'shuffled groove'], effectiveBpm: 130 },
    bpmRange: { min: 125, max: 140, typical: 130 },
    swingRange: { min: 30, max: 60 },
    characteristics: ['skippy', 'shuffled', 'syncopated bass', 'vocal chops'],
    subgenres: ['2-Step', 'Speed Garage', 'Bassline', 'UK Bass']
  },

  reggaeton: {
    name: 'Reggaeton / Dembow',
    kickPattern: {
      type: 'dembow',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: false,
      character: ['punchy', 'tight']
    },
    snarePattern: {
      type: 'syncopated',
      positions: [3, 7, 11, 15],
      ghostNotes: [],
      rolls: ['none'],
      rimshots: true,
      character: ['rim', 'crispy']
    },
    hihatPattern: {
      type: 'straight-16ths',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [],
      velocity: 'consistent',
      rhythm: 'straight',
      character: ['crispy', 'tight']
    },
    cadence: {
      density: 'dense',
      complexity: 3,
      syncopation: 40,
      polyrhythm: false,
      layers: 3,
      groove: 'syncopated'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['dembow rhythm', 'snare on offbeats'], effectiveBpm: 95 },
    bpmRange: { min: 88, max: 100, typical: 95 },
    swingRange: { min: 0, max: 15 },
    characteristics: ['dembow rhythm', 'offbeat snares', 'danceable', 'Latin flavor'],
    subgenres: ['Old School Reggaeton', 'Modern Reggaeton', 'Dembow', 'Latin Trap', 'Perreo']
  },

  dubstep: {
    name: 'Dubstep',
    kickPattern: {
      type: 'two-step',
      positions: [1, 9],
      velocity: 'dynamic',
      subBass: true,
      sidechain: true,
      character: ['deep', 'punchy', 'synthetic']
    },
    snarePattern: {
      type: 'halftime-backbeat',
      positions: [9],
      ghostNotes: [5, 13],
      rolls: ['buildup'],
      rimshots: false,
      character: ['fat', 'reverbed', 'processed']
    },
    hihatPattern: {
      type: 'sparse-minimal',
      positions: [3, 7, 11, 15],
      openPositions: [7, 15],
      velocity: 'dynamic',
      rhythm: 'straight',
      character: ['electronic', 'crispy']
    },
    cadence: {
      density: 'sparse',
      complexity: 6,
      syncopation: 50,
      polyrhythm: false,
      layers: 3,
      groove: 'behind-the-beat'
    },
    timingFeel: { type: 'half-time', confidence: 95, indicators: ['snare on 3', 'wobble bass', 'sparse drums'], effectiveBpm: 70 },
    bpmRange: { min: 138, max: 145, typical: 140 },
    swingRange: { min: 0, max: 20 },
    characteristics: ['half-time feel', 'wobble bass', 'drops', 'sub-heavy'],
    subgenres: ['Brostep', 'Deep Dubstep', 'Melodic Dubstep', 'Riddim', 'Tearout']
  },

  funk: {
    name: 'Funk',
    kickPattern: {
      type: 'boom-bap',
      positions: [1, 5, 11, 13],
      velocity: 'dynamic',
      subBass: false,
      sidechain: false,
      character: ['punchy', 'acoustic', 'tight']
    },
    snarePattern: {
      type: 'syncopated',
      positions: [5, 13],
      ghostNotes: [3, 7, 9, 11, 15],
      rolls: ['flam', 'drag'],
      rimshots: false,
      character: ['snappy', 'acoustic', 'loose']
    },
    hihatPattern: {
      type: 'straight-16ths',
      positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      openPositions: [4, 8, 12, 16],
      velocity: 'humanized',
      rhythm: 'straight',
      character: ['acoustic', 'bright', 'open']
    },
    cadence: {
      density: 'dense',
      complexity: 7,
      syncopation: 70,
      polyrhythm: false,
      layers: 4,
      groove: 'syncopated'
    },
    timingFeel: { type: 'full-time', confidence: 90, indicators: ['syncopated', 'ghost notes', 'tight pocket'], effectiveBpm: 105 },
    bpmRange: { min: 95, max: 115, typical: 105 },
    swingRange: { min: 30, max: 60 },
    characteristics: ['syncopated', 'ghost notes', 'tight pocket', 'groovy'],
    subgenres: ['Classic Funk', 'P-Funk', 'G-Funk', 'Electro Funk', 'Nu-Funk']
  },

  disco: {
    name: 'Disco',
    kickPattern: {
      type: 'four-on-the-floor',
      positions: [1, 5, 9, 13],
      velocity: 'consistent',
      subBass: false,
      sidechain: false,
      character: ['punchy', 'acoustic', 'tight']
    },
    snarePattern: {
      type: 'backbeat',
      positions: [5, 13],
      ghostNotes: [3, 11],
      rolls: ['none'],
      rimshots: false,
      character: ['snappy', 'acoustic', 'tight']
    },
    hihatPattern: {
      type: 'straight-8ths',
      positions: [1, 3, 5, 7, 9, 11, 13, 15],
      openPositions: [3, 7, 11, 15],
      velocity: 'accent-offbeat',
      rhythm: 'straight',
      character: ['bright', 'open', 'acoustic']
    },
    cadence: {
      density: 'moderate',
      complexity: 4,
      syncopation: 30,
      polyrhythm: false,
      layers: 3,
      groove: 'straight'
    },
    timingFeel: { type: 'full-time', confidence: 95, indicators: ['four-on-the-floor', 'open hats', 'uplifting'], effectiveBpm: 120 },
    bpmRange: { min: 115, max: 130, typical: 120 },
    swingRange: { min: 10, max: 30 },
    characteristics: ['four-on-the-floor', 'open hi-hats', 'uplifting', 'danceable'],
    subgenres: ['Nu-Disco', 'Italo Disco', 'Space Disco', 'Boogie', 'Disco House']
  }
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze drum patterns from frequency band data
 */
export function analyzeKickPattern(
  kickEnergy: number,
  bpm: number | null,
  onsetTimes: number[] = [],
  genreHints: string[] = []
): KickPattern {
  // Determine kick pattern type based on energy, BPM, and genre hints
  let type: KickPatternType = 'custom'
  const positions: number[] = []
  const character: KickCharacter[] = []
  let subBass = false
  let sidechain = false
  
  // Analyze BPM range for pattern inference
  if (bpm) {
    if (bpm >= 118 && bpm <= 135) {
      // House/Techno range
      type = 'four-on-the-floor'
      positions.push(1, 5, 9, 13)
      sidechain = true
      character.push('punchy', 'tight')
    } else if (bpm >= 80 && bpm <= 100) {
      // Hip-hop range
      if (genreHints.some(g => g.toLowerCase().includes('trap'))) {
        type = '808-trap'
        positions.push(1, 9, 11)
        subBass = true
        character.push('808-sub', 'deep')
      } else {
        type = 'boom-bap'
        positions.push(1, 7, 9, 13)
        character.push('booming', 'punchy')
      }
    } else if (bpm >= 160 && bpm <= 180) {
      // DnB range
      type = 'breakbeat'
      positions.push(1, 7, 9, 15)
      subBass = true
      sidechain = true
      character.push('punchy', 'synthetic')
    } else if (bpm >= 88 && bpm <= 100) {
      // Reggaeton range
      if (genreHints.some(g => g.toLowerCase().includes('reggaeton') || g.toLowerCase().includes('dembow'))) {
        type = 'dembow'
        positions.push(1, 5, 9, 13)
        character.push('punchy', 'tight')
      }
    }
  }
  
  // Adjust based on kick energy
  if (kickEnergy > 0.8) {
    if (!character.includes('distorted')) character.push('distorted')
  } else if (kickEnergy < 0.4) {
    type = 'minimal'
    character.push('tight', 'clicky')
  }
  
  // Determine velocity pattern
  const velocity: KickPattern['velocity'] = kickEnergy > 0.7 ? 'accent-heavy' : 
                                             kickEnergy > 0.5 ? 'consistent' : 'dynamic'
  
  return {
    type,
    positions: positions.length > 0 ? positions : [1, 5, 9, 13],
    velocity,
    subBass,
    sidechain,
    character: character.length > 0 ? character : ['punchy']
  }
}

/**
 * Analyze snare patterns
 */
export function analyzeSnarePattern(
  snareEnergy: number,
  bpm: number | null,
  kickPattern: KickPattern,
  genreHints: string[] = []
): SnarePattern {
  let type: SnarePatternType = 'backbeat'
  const positions: number[] = [5, 13]  // Default backbeat
  const ghostNotes: number[] = []
  const rolls: SnareRollType[] = ['none']
  let rimshots = false
  const character: SnareCharacter[] = []
  
  // Determine pattern based on genre and BPM
  if (bpm) {
    if (bpm < 100) {
      // Slow tempo - likely hip-hop or half-time
      if (genreHints.some(g => g.toLowerCase().includes('trap'))) {
        type = 'trap-rolls'
        rolls.length = 0
        rolls.push('triplet-roll', 'buildup')
        character.push('snappy', 'layered')
      } else if (genreHints.some(g => g.toLowerCase().includes('boom bap') || g.toLowerCase().includes('lofi'))) {
        type = 'boom-bap-crack'
        ghostNotes.push(3, 11, 15)
        character.push('snappy', 'vinyl', 'crispy')
      } else {
        // Check for half-time snare (on beat 3 only)
        if (kickPattern.type === '808-trap' || kickPattern.type === 'halftime-dnb') {
          type = 'halftime-backbeat'
          positions.length = 0
          positions.push(9)  // Snare on beat 3
          character.push('fat', 'reverbed')
        }
      }
    } else if (bpm >= 160) {
      // Fast tempo - likely DnB or hardcore
      type = 'breakbeat'
      ghostNotes.push(3, 7, 11, 15)
      rolls.length = 0
      rolls.push('16th-fill')
      character.push('snappy', 'compressed')
    }
  }
  
  // Adjust based on snare energy
  if (snareEnergy > 0.7) {
    if (!character.includes('layered')) character.push('layered')
    if (!character.includes('processed')) character.push('processed')
  } else if (snareEnergy < 0.3) {
    rimshots = true
    character.push('rim', 'tight')
  }
  
  return {
    type,
    positions,
    ghostNotes,
    rolls,
    rimshots,
    character: character.length > 0 ? character : ['snappy']
  }
}

/**
 * Analyze hi-hat patterns
 */
export function analyzeHihatPattern(
  hihatEnergy: number,
  bpm: number | null,
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  genreHints: string[] = []
): HihatPattern {
  let type: HihatPatternType = 'straight-8ths'
  let positions: number[] = [1, 3, 5, 7, 9, 11, 13, 15]
  let openPositions: number[] = []
  let velocity: HihatVelocity = 'consistent'
  let rhythm: HihatRhythm = 'straight'
  const character: HihatCharacter[] = []
  
  // Determine pattern based on genre and BPM
  if (bpm) {
    if (bpm >= 118 && bpm <= 135) {
      // House range
      if (genreHints.some(g => g.toLowerCase().includes('tech house'))) {
        type = 'straight-16ths'
        positions = Array.from({ length: 16 }, (_, i) => i + 1)
        velocity = 'dynamic'
        character.push('crispy', 'electronic')
      } else {
        type = 'offbeat-8ths'
        positions = [3, 7, 11, 15]
        openPositions = [7, 15]
        velocity = 'accent-offbeat'
        character.push('crispy', 'open')
      }
    } else if (bpm < 100) {
      // Hip-hop range
      if (genreHints.some(g => g.toLowerCase().includes('trap'))) {
        type = 'triplet-flow'
        positions = Array.from({ length: 16 }, (_, i) => i + 1)
        openPositions = [8, 16]
        velocity = 'dynamic'
        rhythm = 'triplet'
        character.push('crispy', 'electronic')
      } else {
        type = 'swing-hats'
        rhythm = 'swing'
        velocity = 'humanized'
        openPositions = [7, 15]
        character.push('crispy', 'acoustic')
      }
    } else if (bpm >= 160) {
      // DnB range
      type = 'breakbeat-chops'
      positions = Array.from({ length: 16 }, (_, i) => i + 1)
      openPositions = [4, 8, 12, 16]
      velocity = 'dynamic'
      rhythm = 'compound'
      character.push('electronic', 'crispy')
    }
  }
  
  // Adjust based on hihat energy
  if (hihatEnergy > 0.7) {
    if (!character.includes('bright')) character.push('bright')
  } else if (hihatEnergy < 0.3) {
    type = 'sparse-minimal'
    positions = positions.filter((_, i) => i % 2 === 0)
    character.push('dark', 'filtered')
  }
  
  return {
    type,
    positions,
    openPositions,
    velocity,
    rhythm,
    character: character.length > 0 ? character : ['crispy']
  }
}

/**
 * Analyze percussion cadence
 */
export function analyzePercussionCadence(
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  hihatPattern: HihatPattern,
  bpm: number | null
): PercussionCadence {
  // Calculate total positions
  const totalPositions = new Set([
    ...kickPattern.positions,
    ...snarePattern.positions,
    ...snarePattern.ghostNotes,
    ...hihatPattern.positions
  ]).size
  
  // Determine density
  let density: PercussionCadence['density'] = 'moderate'
  if (totalPositions >= 14) density = 'hyperdense'
  else if (totalPositions >= 10) density = 'dense'
  else if (totalPositions <= 5) density = 'sparse'
  
  // Calculate complexity (1-10)
  const complexity = Math.min(10, Math.round(
    (snarePattern.ghostNotes.length * 0.5) +
    (snarePattern.rolls.filter(r => r !== 'none').length * 1) +
    (kickPattern.positions.length * 0.3) +
    (hihatPattern.rhythm === 'compound' ? 2 : hihatPattern.rhythm === 'triplet' ? 1.5 : 0.5)
  ))
  
  // Calculate syncopation (0-100)
  const offbeatKicks = kickPattern.positions.filter(p => p % 4 !== 1).length
  const syncopation = Math.min(100, Math.round(
    (offbeatKicks / kickPattern.positions.length) * 50 +
    (snarePattern.ghostNotes.length * 5) +
    (snarePattern.type.includes('syncopated') ? 20 : 0)
  ))
  
  // Determine groove type
  let groove: GrooveType = 'straight'
  if (hihatPattern.rhythm === 'swing') groove = 'swing'
  else if (hihatPattern.rhythm === 'shuffle') groove = 'shuffle'
  else if (syncopation > 60) groove = 'syncopated'
  else if (bpm && bpm < 90) groove = 'lazy'
  else if (density === 'dense' || density === 'hyperdense') groove = 'hypnotic'
  
  // Determine polyrhythm
  const polyrhythm = hihatPattern.rhythm === 'triplet' || hihatPattern.rhythm === 'polyrhythmic'
  
  // Count layers
  const layers = 3 + // kick, snare, hihat
    (snarePattern.ghostNotes.length > 3 ? 1 : 0) +
    (hihatPattern.openPositions.length > 2 ? 1 : 0) +
    (kickPattern.subBass ? 1 : 0)
  
  return {
    density,
    complexity,
    syncopation,
    polyrhythm,
    layers,
    groove
  }
}

/**
 * Detect timing feel (half-time vs full-time)
 */
export function detectTimingFeel(
  bpm: number | null,
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  basslineType: BasslineType | null,
  genreHints: string[] = []
): TimingFeel {
  const indicators: string[] = []
  let type: TimingFeel['type'] = 'full-time'
  let confidence = 50
  let effectiveBpm = bpm || 120
  
  // Strong half-time indicators
  const halfTimePatterns = [
    '808-trap', 'halftime-dnb', 'two-step'
  ]
  const halfTimeSnares = [
    'halftime-backbeat', 'trap-rolls'
  ]
  const halfTimeGenres = [
    'trap', 'hip-hop', 'hip hop', 'dubstep', 'halftime', 'phonk',
    'lo-fi', 'lofi', 'boom bap', 'drill'
  ]
  const halfTimeBasslines: BasslineType[] = [
    '808-sub', '808-sliding', 'wobble'
  ]
  
  // Check kick pattern
  if (halfTimePatterns.includes(kickPattern.type)) {
    indicators.push(`${kickPattern.type} kick pattern`)
    confidence += 25
  }
  
  // Check snare pattern
  if (halfTimeSnares.includes(snarePattern.type)) {
    indicators.push(`${snarePattern.type} snare`)
    confidence += 25
  }
  
  // Check if snare is only on beat 3 (half-time signature)
  if (snarePattern.positions.length === 1 && snarePattern.positions[0] === 9) {
    indicators.push('snare on beat 3 only')
    confidence += 30
  }
  
  // Check bassline
  if (basslineType && halfTimeBasslines.includes(basslineType)) {
    indicators.push(`${basslineType} bassline`)
    confidence += 20
  }
  
  // Check genre hints
  const matchedGenres = genreHints.filter(g => 
    halfTimeGenres.some(hg => g.toLowerCase().includes(hg))
  )
  if (matchedGenres.length > 0) {
    indicators.push(`genre context: ${matchedGenres.join(', ')}`)
    confidence += matchedGenres.length * 10
  }
  
  // Check BPM
  if (bpm) {
    if (bpm < 90) {
      indicators.push('very low BPM')
      confidence += 25
    } else if (bpm < 100) {
      indicators.push('low BPM range')
      confidence += 15
    } else if (bpm >= 130 && bpm <= 150) {
      // Trap range - check other indicators
      if (kickPattern.subBass && snarePattern.type === 'trap-rolls') {
        indicators.push('trap tempo with 808/rolls')
        confidence += 20
      }
    } else if (bpm >= 138 && bpm <= 145) {
      // Dubstep range
      if (snarePattern.type === 'halftime-backbeat') {
        indicators.push('dubstep tempo with halftime snare')
        confidence += 25
      }
    } else if (bpm >= 170 && bpm <= 180) {
      // DnB range - check for halftime DnB
      if (kickPattern.type === 'halftime-dnb' || snarePattern.positions.includes(9)) {
        indicators.push('DnB tempo with halftime pattern')
        confidence += 25
        effectiveBpm = bpm / 2
      }
    }
  }
  
  // Determine timing type and confidence
  confidence = Math.min(100, confidence)
  
  if (confidence >= 70) {
    type = 'half-time'
    effectiveBpm = bpm ? bpm / 2 : 70
  } else if (confidence >= 40 && confidence < 70) {
    // Check for double-time or variable
    if (bpm && bpm >= 160 && !halfTimePatterns.includes(kickPattern.type)) {
      type = 'full-time'
      indicators.push('fast but straight feel')
    }
  }
  
  // Adjust effective BPM based on timing
  if (type === 'half-time' && bpm) {
    effectiveBpm = Math.round(bpm / 2)
  } else if (bpm) {
    effectiveBpm = bpm
  }
  
  return {
    type,
    confidence,
    indicators,
    effectiveBpm
  }
}

/**
 * Analyze bassline characteristics
 */
export function analyzeBassline(
  lowFreqEnergy: number,
  bpm: number | null,
  genreHints: string[] = []
): BasslineAnalysis {
  let type: BasslineType = 'synth-bass'
  const character: string[] = []
  let rhythm: BasslineRhythm = 'follows-kick'
  let slides = false
  let subHarmonics = lowFreqEnergy > 0.7
  let syncopation = 30
  
  // Determine type based on genre and energy
  if (genreHints.some(g => g.toLowerCase().includes('trap') || g.toLowerCase().includes('hip'))) {
    if (lowFreqEnergy > 0.6) {
      type = '808-sliding'
      slides = true
      subHarmonics = true
      character.push('deep', 'heavy', 'distorted')
      rhythm = 'sparse'
      syncopation = 50
    } else {
      type = '808-sub'
      subHarmonics = true
      character.push('deep', 'sustained')
      rhythm = 'sparse'
    }
  } else if (genreHints.some(g => g.toLowerCase().includes('dnb') || g.toLowerCase().includes('drum'))) {
    if (lowFreqEnergy > 0.7) {
      type = 'neuro'
      character.push('aggressive', 'modulated')
      rhythm = 'syncopated'
      syncopation = 70
    } else {
      type = 'reese'
      character.push('deep', 'evolving')
      rhythm = 'rolling'
      syncopation = 50
    }
  } else if (genreHints.some(g => g.toLowerCase().includes('dubstep'))) {
    type = 'wobble'
    character.push('modulated', 'heavy')
    rhythm = 'syncopated'
    syncopation = 60
  } else if (genreHints.some(g => g.toLowerCase().includes('house') || g.toLowerCase().includes('tech'))) {
    type = 'synth-bass'
    character.push('punchy', 'filtered')
    rhythm = 'follows-kick'
    syncopation = 20
  } else if (genreHints.some(g => g.toLowerCase().includes('funk'))) {
    type = 'melodic'
    character.push('groovy', 'syncopated')
    rhythm = 'melodic'
    syncopation = 60
  }
  
  return {
    type,
    character,
    rhythm,
    slides,
    subHarmonics,
    syncopation
  }
}

/**
 * Match patterns to known signatures
 */
export function matchPatternSignature(
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  hihatPattern: HihatPattern,
  timing: TimingFeel,
  bpm: number | null
): { name: string; similarity: number; matchedFeatures: string[] } | null {
  let bestMatch: { name: string; similarity: number; matchedFeatures: string[] } | null = null
  let highestScore = 0
  
  for (const [key, signature] of Object.entries(DRUM_PATTERN_SIGNATURES)) {
    let score = 0
    const matchedFeatures: string[] = []
    
    // BPM match (30 points)
    if (bpm) {
      if (bpm >= signature.bpmRange.min && bpm <= signature.bpmRange.max) {
        const bpmScore = 30 * (1 - Math.abs(bpm - signature.bpmRange.typical) / 30)
        score += bpmScore
        matchedFeatures.push(`BPM ${bpm} in range`)
      }
    }
    
    // Kick pattern match (20 points)
    if (kickPattern.type === signature.kickPattern.type) {
      score += 20
      matchedFeatures.push(`kick: ${kickPattern.type}`)
    }
    
    // Snare pattern match (15 points)
    if (snarePattern.type === signature.snarePattern.type) {
      score += 15
      matchedFeatures.push(`snare: ${snarePattern.type}`)
    }
    
    // Hi-hat pattern match (15 points)
    if (hihatPattern.type === signature.hihatPattern.type) {
      score += 15
      matchedFeatures.push(`hihat: ${hihatPattern.type}`)
    }
    
    // Timing match (20 points)
    if (timing.type === signature.timingFeel.type) {
      score += 20
      matchedFeatures.push(`timing: ${timing.type}`)
    }
    
    if (score > highestScore && score >= 40) {
      highestScore = score
      bestMatch = {
        name: signature.name,
        similarity: score,
        matchedFeatures
      }
    }
  }
  
  return bestMatch
}

/**
 * Classify drum genre from analysis
 */
export function classifyDrumGenre(
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  hihatPattern: HihatPattern,
  timing: TimingFeel,
  bpm: number | null,
  signatureMatch: { name: string; similarity: number; matchedFeatures: string[] } | null
): { primary: string; secondary: string[]; subgenres: string[]; confidence: number } {
  const secondary: string[] = []
  let subgenres: string[] = []
  let primary = 'Electronic'
  let confidence = 0.5
  
  // Use signature match if available
  if (signatureMatch && signatureMatch.similarity >= 60) {
    const signature = Object.values(DRUM_PATTERN_SIGNATURES).find(s => s.name === signatureMatch.name)
    if (signature) {
      primary = signature.name
      subgenres = signature.subgenres
      confidence = signatureMatch.similarity / 100
      
      // Add related genres as secondary
      if (signature.name.includes('House')) {
        secondary.push('House', 'Electronic', 'Dance')
      } else if (signature.name.includes('Techno')) {
        secondary.push('Techno', 'Electronic', 'Industrial')
      } else if (signature.name.includes('Hip')) {
        secondary.push('Hip-Hop', 'Rap', 'Urban')
      } else if (signature.name.includes('DnB') || signature.name.includes('Drum')) {
        secondary.push('Drum & Bass', 'Jungle', 'Bass Music')
      }
    }
  } else {
    // Fallback to pattern-based classification
    if (kickPattern.type === 'four-on-the-floor') {
      if (bpm && bpm >= 128 && bpm <= 145) {
        primary = 'Techno'
        subgenres = ['Peak Time Techno', 'Industrial Techno']
      } else {
        primary = 'House'
        subgenres = ['Classic House', 'Deep House']
      }
      secondary.push('Dance', 'Electronic')
      confidence = 0.7
    } else if (kickPattern.type === 'boom-bap' || kickPattern.type === '808-trap') {
      if (timing.type === 'half-time') {
        if (kickPattern.subBass) {
          primary = 'Trap'
          subgenres = ['Melodic Trap', 'Hard Trap']
        } else {
          primary = 'Hip-Hop'
          subgenres = ['Boom Bap', 'Lo-Fi']
        }
        secondary.push('Rap', 'Urban')
        confidence = 0.75
      }
    } else if (kickPattern.type === 'breakbeat') {
      if (bpm && bpm >= 160) {
        primary = 'Drum & Bass'
        subgenres = ['Liquid DnB', 'Neurofunk']
        secondary.push('Jungle', 'Bass Music')
      } else {
        primary = 'Breakbeat'
        subgenres = ['Big Beat', 'Breaks']
      }
      confidence = 0.7
    }
  }
  
  return {
    primary,
    secondary: Array.from(new Set(secondary)),
    subgenres,
    confidence
  }
}

/**
 * Generate detailed description
 */
export function generateDrumDescription(
  kickPattern: KickPattern,
  snarePattern: SnarePattern,
  hihatPattern: HihatPattern,
  cadence: PercussionCadence,
  timing: TimingFeel,
  drumGenre: { primary: string; secondary: string[]; subgenres: string[]; confidence: number }
): string {
  const parts: string[] = []
  
  // Opening with genre
  parts.push(`${drumGenre.primary} drum pattern with ${timing.type} feel`)
  
  // Kick description
  const kickDesc = kickPattern.character.slice(0, 2).join(', ')
  parts.push(`featuring ${kickDesc} ${kickPattern.type.replace(/-/g, ' ')} kick`)
  
  // Snare description
  if (snarePattern.type !== 'minimal') {
    const snareDesc = snarePattern.character.slice(0, 2).join(', ')
    parts.push(`${snareDesc} ${snarePattern.type.replace(/-/g, ' ')} snare`)
    if (snarePattern.ghostNotes.length > 0) {
      parts.push('with ghost notes')
    }
    if (snarePattern.rolls.some(r => r !== 'none')) {
      parts.push(`and ${snarePattern.rolls.filter(r => r !== 'none').join('/')} rolls`)
    }
  }
  
  // Hi-hat description
  const hihatDesc = hihatPattern.character.slice(0, 2).join(', ')
  parts.push(`${hihatDesc} ${hihatPattern.type.replace(/-/g, ' ')} hi-hats`)
  if (hihatPattern.openPositions.length > 0) {
    parts.push('with open hat accents')
  }
  
  // Groove description
  parts.push(`Overall ${cadence.groove} groove with ${cadence.density} density`)
  parts.push(`complexity ${cadence.complexity}/10`)
  if (cadence.syncopation > 50) {
    parts.push('highly syncopated')
  }
  
  // Timing description
  if (timing.indicators.length > 0) {
    parts.push(`(${timing.indicators.slice(0, 2).join(', ')})`)
  }
  
  return parts.join(', ').replace(/,\s*,/g, ',') + '.'
}

/**
 * Main analysis function
 */
export function analyzeAdvancedDrumPattern(
  frequencyBands: {
    kicks: number
    snares: number
    hihats: number
    cymbals: number
    lowFreq?: number
  },
  bpm: number | null,
  genreHints: string[] = [],
  onsetTimes: number[] = []
): DrumAnalysisResult {
  // Analyze individual patterns
  const kickPattern = analyzeKickPattern(frequencyBands.kicks, bpm, onsetTimes, genreHints)
  const snarePattern = analyzeSnarePattern(frequencyBands.snares, bpm, kickPattern, genreHints)
  const hihatPattern = analyzeHihatPattern(frequencyBands.hihats, bpm, kickPattern, snarePattern, genreHints)
  
  // Analyze bassline
  const bassline = frequencyBands.lowFreq !== undefined
    ? analyzeBassline(frequencyBands.lowFreq, bpm, genreHints)
    : null
  
  // Analyze cadence
  const cadence = analyzePercussionCadence(kickPattern, snarePattern, hihatPattern, bpm)
  
  // Detect timing feel
  const timing = detectTimingFeel(bpm, kickPattern, snarePattern, bassline?.type || null, genreHints)
  
  // Match to known signatures
  const signatureMatch = matchPatternSignature(kickPattern, snarePattern, hihatPattern, timing, bpm)
  
  // Classify genre
  const drumGenre = classifyDrumGenre(kickPattern, snarePattern, hihatPattern, timing, bpm, signatureMatch)
  
  // Build characteristics list
  const characteristics: string[] = [
    ...kickPattern.character,
    timing.type,
    cadence.groove,
    `${cadence.density} percussion`
  ]
  
  if (timing.type === 'half-time') {
    characteristics.push('half-time feel')
  }
  if (cadence.syncopation > 50) {
    characteristics.push('syncopated')
  }
  if (cadence.polyrhythm) {
    characteristics.push('polyrhythmic')
  }
  
  // Generate description
  const description = generateDrumDescription(
    kickPattern,
    snarePattern,
    hihatPattern,
    cadence,
    timing,
    drumGenre
  )
  
  return {
    kickPattern,
    snarePattern,
    hihatPattern,
    cadence,
    timing,
    bassline,
    drumGenre,
    characteristics: Array.from(new Set(characteristics)),
    signatureMatch,
    description
  }
}

export default analyzeAdvancedDrumPattern
