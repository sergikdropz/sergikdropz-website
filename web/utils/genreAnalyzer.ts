/**
 * GenreAnalyzer - Comprehensive Multi-Factor Genre Classification
 * 
 * Combines BPM, drum patterns, key/scale, harmonic complexity, instrument signatures,
 * energy profiles, and production characteristics for accurate genre detection.
 * 
 * Based on SERGIK DNA profile and music theory knowledge base.
 */

import { classifyWithGenreEngine } from '@/lib/audio/genre-engine'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface TrackCharacteristics {
  // Core metrics
  bpm?: number;
  key?: string;           // Camelot notation (e.g., '10B')
  energy?: number;        // 1-10 scale
  
  // Drum patterns
  drums?: {
    kickPattern?: string;
    hatPattern?: string;
    snarePattern?: string;
    swing?: number;       // 0-100%
    complexity?: number;  // 1-10
  };
  
  // Harmonic characteristics
  harmony?: {
    chordComplexity?: 'simple' | 'medium' | 'complex' | 'jazz';
    progression?: string;   // e.g., 'i-iv-v', 'I-V-vi-IV'
    bassType?: string;      // e.g., 'sub', 'syncopated', 'walking'
    padTextures?: boolean;
  };
  
  // Instrument signatures
  instruments?: {
    has808?: boolean;
    hasAcidBass?: boolean;
    hasAcousticDrums?: boolean;
    hasStrings?: boolean;
    hasPads?: boolean;
    hasChoppedVocals?: boolean;
    hasSynthLead?: boolean;
    hasOrgan?: boolean;
    hasPiano?: boolean;
    hasGuitar?: boolean;
  };
  
  // Production characteristics
  production?: {
    era?: 'vintage' | 'modern' | 'lofi' | 'clean';
    warmth?: number;        // 1-10
    spaceReverb?: number;   // 1-10
    sidechaining?: boolean;
    buildDrop?: boolean;
  };
  
  // Vocal characteristics
  vocals?: {
    type?: 'none' | 'melodic' | 'rap' | 'chopped' | 'spoken' | 'sample';
    prominence?: number;    // 1-10
  };
}

export interface GenreScore {
  genre: string;
  subgenre?: string;
  score: number;          // 0-100
  confidence: 'low' | 'medium' | 'high';
  matchingFactors: string[];
}

export interface GenreAnalysisResult {
  primaryGenre: GenreScore;
  secondaryGenres: GenreScore[];
  allScores: GenreScore[];
  characteristics: {
    tempo: string;
    mood: string;
    danceability: string;
    production: string;
  };
  recommendations: {
    mixableWith: string[];
    similarArtists: string[];
    productionTips: string[];
  };
}

// =============================================================================
// Genre Profiles Database
// =============================================================================

interface GenreProfile {
  name: string;
  subgenres: string[];
  bpmRange: { min: number; max: number; sweet: number };
  keyPreference: {
    preferMinor: boolean;
    commonKeys: string[];
  };
  drumPatterns: {
    kickStyle: string[];
    hatStyle: string[];
    snareStyle: string[];
    swingRange: { min: number; max: number };
  };
  harmonyProfile: {
    complexity: ('simple' | 'medium' | 'complex' | 'jazz')[];
    commonProgressions: string[];
    bassType: string[];
  };
  instrumentSignatures: string[];
  productionEra: ('vintage' | 'modern' | 'lofi' | 'clean')[];
  energyRange: { min: number; max: number };
  characteristics: string[];
  weight: number; // Base weight for this genre (1-10)
}

const GENRE_PROFILES: Record<string, GenreProfile> = {
  // =============================================================================
  // House Music Family
  // =============================================================================
  house: {
    name: 'House',
    subgenres: ['Deep House', 'Classic House', 'Vocal House', 'Progressive House'],
    bpmRange: { min: 118, max: 132, sweet: 124 },
    keyPreference: {
      preferMinor: false,
      commonKeys: ['10B', '9B', '11B', '6B', '8B']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'four-to-the-floor'],
      hatStyle: ['offbeat', 'offbeat-8ths', 'open-hat'],
      snareStyle: ['backbeat', 'clap-2-4'],
      swingRange: { min: 0, max: 30 }
    },
    harmonyProfile: {
      complexity: ['medium'],
      commonProgressions: ['I-V-vi-IV', 'i-VII-VI', 'i-iv'],
      bassType: ['sub', 'filtered', 'synth']
    },
    instrumentSignatures: ['pads', 'piano', 'organ', 'synth-stabs'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 5, max: 8 },
    characteristics: ['uplifting', 'groovy', 'soulful', 'four-on-the-floor'],
    weight: 8
  },

  tech_house: {
    name: 'Tech House',
    subgenres: ['Minimal Tech House', 'Groovy Tech House', 'Bass House'],
    bpmRange: { min: 122, max: 130, sweet: 126 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '5A', '6A', '10B']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'driving'],
      hatStyle: ['rolling-16ths', '16th-shuffle', 'triplet-hats'],
      snareStyle: ['backbeat', 'syncopated-clap'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['i-VII', 'single-chord', 'two-chord'],
      bassType: ['rolling', 'filtered', 'acid']
    },
    instrumentSignatures: ['percussion', 'synth-stabs', 'vocal-chops'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['driving', 'hypnotic', 'minimal', 'groovy'],
    weight: 8
  },

  deep_house: {
    name: 'Deep House',
    subgenres: ['Organic House', 'Melodic House', 'Afro House'],
    bpmRange: { min: 118, max: 125, sweet: 122 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '9A', '10A', '6A']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'soft-kick'],
      hatStyle: ['sparse-swing', 'soft-hats', 'shaker'],
      snareStyle: ['rim-shot', 'soft-clap'],
      swingRange: { min: 20, max: 50 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      commonProgressions: ['i-iv-VII-III', 'jazz-influenced'],
      bassType: ['deep', 'warm', 'melodic']
    },
    instrumentSignatures: ['pads', 'rhodes', 'piano', 'strings', 'sax'],
    productionEra: ['modern', 'vintage'],
    energyRange: { min: 4, max: 6 },
    characteristics: ['warm', 'soulful', 'atmospheric', 'jazzy'],
    weight: 7
  },

  // =============================================================================
  // Techno Family
  // =============================================================================
  techno: {
    name: 'Techno',
    subgenres: ['Minimal Techno', 'Peak Time Techno', 'Industrial Techno', 'Melodic Techno'],
    bpmRange: { min: 128, max: 145, sweet: 135 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['4A', '5A', '6A', '7A', '3A']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'driving', 'distorted-kick'],
      hatStyle: ['driving-16ths', 'industrial', 'minimal-hats'],
      snareStyle: ['none-or-clap', 'industrial', 'syncopated'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['simple'],
      commonProgressions: ['single-note', 'drone', 'minimal'],
      bassType: ['distorted', 'acid', 'sub']
    },
    instrumentSignatures: ['industrial-sounds', 'noise', 'acid-303', 'modular'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['dark', 'driving', 'hypnotic', 'industrial'],
    weight: 8
  },

  minimal: {
    name: 'Minimal',
    subgenres: ['Minimal House', 'Minimal Techno', 'Microhouse'],
    bpmRange: { min: 120, max: 135, sweet: 128 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['5A', '6A', '7A', '8A']
    },
    drumPatterns: {
      kickStyle: ['sparse-kick', 'glitchy'],
      hatStyle: ['minimal-percs', 'glitch', 'clicks'],
      snareStyle: ['syncopated', 'sparse'],
      swingRange: { min: 10, max: 40 }
    },
    harmonyProfile: {
      complexity: ['simple'],
      commonProgressions: ['loop-based', 'minimal'],
      bassType: ['glitchy', 'minimal', 'sub']
    },
    instrumentSignatures: ['clicks', 'glitch', 'micro-sounds'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 5, max: 7 },
    characteristics: ['sparse', 'hypnotic', 'glitchy', 'repetitive'],
    weight: 6
  },

  // =============================================================================
  // Hip-Hop Family
  // =============================================================================
  hiphop: {
    name: 'Hip-Hop',
    subgenres: ['Boom Bap', 'Trap', 'Lo-Fi Hip-Hop', 'Conscious Hip-Hop'],
    bpmRange: { min: 80, max: 100, sweet: 90 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '5A', '6A', '4A']
    },
    drumPatterns: {
      kickStyle: ['boom-bap', 'swing-kick', 'sampled'],
      hatStyle: ['swing-hats', 'loose', 'dusty'],
      snareStyle: ['2-and-4', 'snappy', 'sampled'],
      swingRange: { min: 40, max: 70 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      commonProgressions: ['sample-based', 'jazz-loop', 'soul-chop'],
      bassType: ['sampled', 'synth', 'clean']
    },
    instrumentSignatures: ['samples', 'vinyl-crackle', 'scratches', 'mpc-chops'],
    productionEra: ['vintage', 'lofi'],
    energyRange: { min: 4, max: 7 },
    characteristics: ['groovy', 'swinging', 'sample-based', 'lyrical'],
    weight: 9
  },

  boom_bap: {
    name: 'Boom Bap',
    subgenres: ['Golden Era', 'East Coast', 'Jazz Rap'],
    bpmRange: { min: 85, max: 98, sweet: 92 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '9A', '6A']
    },
    drumPatterns: {
      kickStyle: ['boom-bap', 'punchy', 'mpc'],
      hatStyle: ['swing-hats', 'shaker', 'ride'],
      snareStyle: ['2-and-4', 'snappy', 'cracking'],
      swingRange: { min: 50, max: 70 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      commonProgressions: ['jazz-sample', 'soul-chop', 'i-iv-VII'],
      bassType: ['sampled', 'upright', 'clean']
    },
    instrumentSignatures: ['jazz-samples', 'rhodes', 'horns', 'strings', 'vinyl-crackle'],
    productionEra: ['vintage'],
    energyRange: { min: 5, max: 7 },
    characteristics: ['jazzy', 'soulful', 'headnodding', 'lyrical'],
    weight: 8
  },

  trap: {
    name: 'Trap',
    subgenres: ['Melodic Trap', 'Hard Trap', 'Drill', 'Phonk'],
    bpmRange: { min: 130, max: 170, sweet: 145 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['4A', '5A', '6A', '7A', '8A']
    },
    drumPatterns: {
      kickStyle: ['808-sub', '808-bass', 'distorted-808'],
      hatStyle: ['triplet-rolls', 'hi-hat-rolls', 'fast-hats'],
      snareStyle: ['syncopated', 'sharp-snare', 'clap'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['dark-minor', 'eerie', 'simple-loop'],
      bassType: ['808-sub', 'distorted-808', 'sliding-808']
    },
    instrumentSignatures: ['808-bass', 'brass-hits', 'bells', 'dark-synths'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 9 },
    characteristics: ['hard', 'dark', 'bass-heavy', 'hi-hat-rolls'],
    weight: 8
  },

  lofi: {
    name: 'Lo-Fi',
    subgenres: ['Lo-Fi Hip-Hop', 'Chillhop', 'Study Beats', 'Bedroom Pop'],
    bpmRange: { min: 70, max: 90, sweet: 80 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '9A', '2A', '3A']
    },
    drumPatterns: {
      kickStyle: ['boom-bap', 'soft-kick', 'vinyl'],
      hatStyle: ['dusty-swing', 'lofi', 'tape-hiss'],
      snareStyle: ['2-and-4', 'soft-snare', 'vinyl-snap'],
      swingRange: { min: 40, max: 65 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex', 'jazz'],
      commonProgressions: ['jazz-chords', '2-5-1', 'neo-soul'],
      bassType: ['warm', 'mellow', 'upright']
    },
    instrumentSignatures: ['vinyl-crackle', 'tape-saturation', 'rhodes', 'guitar', 'rain-sounds'],
    productionEra: ['lofi', 'vintage'],
    energyRange: { min: 2, max: 5 },
    characteristics: ['mellow', 'nostalgic', 'warm', 'imperfect'],
    weight: 7
  },

  // =============================================================================
  // Funk & Soul Family
  // =============================================================================
  funk: {
    name: 'Funk',
    subgenres: ['Classic Funk', 'Electro Funk', 'Nu-Funk', 'P-Funk'],
    bpmRange: { min: 95, max: 115, sweet: 105 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['9A', '6A', '7A', '8A', '5A']
    },
    drumPatterns: {
      kickStyle: ['syncopated-funk', 'one-drop', 'james-brown'],
      hatStyle: ['16th-ghost', 'funky-hats', 'open-hat-accents'],
      snareStyle: ['syncopated', 'ghost-notes', 'slap'],
      swingRange: { min: 30, max: 60 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      commonProgressions: ['one-chord', 'I-IV', 'dominant-7th'],
      bassType: ['syncopated', 'slap', 'melodic']
    },
    instrumentSignatures: ['clavinet', 'wah-guitar', 'horns', 'slap-bass', 'organ'],
    productionEra: ['vintage'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['groovy', 'syncopated', 'tight', 'danceable'],
    weight: 8
  },

  disco: {
    name: 'Disco',
    subgenres: ['Nu-Disco', 'Italo Disco', 'Space Disco', 'Boogie'],
    bpmRange: { min: 115, max: 130, sweet: 120 },
    keyPreference: {
      preferMinor: false,
      commonKeys: ['10B', '9B', '11B', '8B', '6B']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'disco-kick'],
      hatStyle: ['open-hat-disco', 'hi-hat-8ths', 'shimmering'],
      snareStyle: ['backbeat', 'tight-snare'],
      swingRange: { min: 10, max: 30 }
    },
    harmonyProfile: {
      complexity: ['medium', 'complex'],
      commonProgressions: ['I-V-vi-IV', 'disco-progression', 'string-arrangements'],
      bassType: ['octave-bass', 'driving', 'melodic']
    },
    instrumentSignatures: ['strings', 'orchestra-hits', 'wah-guitar', 'rhodes', 'congas'],
    productionEra: ['vintage'],
    energyRange: { min: 7, max: 9 },
    characteristics: ['uplifting', 'euphoric', 'orchestral', 'danceable'],
    weight: 7
  },

  soul: {
    name: 'Soul',
    subgenres: ['Neo-Soul', 'Classic Soul', 'Northern Soul', 'Quiet Storm'],
    bpmRange: { min: 70, max: 100, sweet: 85 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '9A', '6A', '10A']
    },
    drumPatterns: {
      kickStyle: ['laid-back', 'soft-kick', 'brushes'],
      hatStyle: ['sparse-feel', 'brushes', 'soft-hats'],
      snareStyle: ['2-and-4', 'rim-shot', 'gospel-snare'],
      swingRange: { min: 30, max: 55 }
    },
    harmonyProfile: {
      complexity: ['complex', 'jazz'],
      commonProgressions: ['2-5-1', 'gospel-changes', 'extended-chords'],
      bassType: ['melodic', 'walking', 'smooth']
    },
    instrumentSignatures: ['rhodes', 'wurlitzer', 'strings', 'horns', 'choir'],
    productionEra: ['vintage'],
    energyRange: { min: 3, max: 6 },
    characteristics: ['emotional', 'soulful', 'warm', 'expressive'],
    weight: 7
  },

  // =============================================================================
  // Electronic / Other
  // =============================================================================
  dnb: {
    name: 'Drum & Bass',
    subgenres: ['Liquid DnB', 'Jump Up', 'Neurofunk', 'Jungle'],
    bpmRange: { min: 160, max: 180, sweet: 174 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['5A', '6A', '7A', '8A', '4A']
    },
    drumPatterns: {
      kickStyle: ['breakbeat', 'two-step', 'amen-break'],
      hatStyle: ['chopped-breaks', 'fast-hats', 'ride'],
      snareStyle: ['syncopated', 'rolling', 'break-snare'],
      swingRange: { min: 0, max: 20 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['minor-stabs', 'bass-driven', 'pad-washes'],
      bassType: ['reese', 'neuro', 'sub', 'wobble']
    },
    instrumentSignatures: ['reese-bass', 'breakbeats', 'amen-break', 'vocal-chops'],
    productionEra: ['modern'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['fast', 'energetic', 'bass-heavy', 'breakbeat'],
    weight: 7
  },

  reggaeton: {
    name: 'Reggaeton',
    subgenres: ['Old School Reggaeton', 'Modern Reggaeton', 'Dembow', 'Latin Trap'],
    bpmRange: { min: 88, max: 100, sweet: 95 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['7A', '8A', '6A', '5A']
    },
    drumPatterns: {
      kickStyle: ['dembow', 'reggaeton-kick'],
      hatStyle: ['dembow-hats', 'tight-hats'],
      snareStyle: ['dembow', 'rim-shot'],
      swingRange: { min: 0, max: 15 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['i-VII-VI-V', 'latin-progression'],
      bassType: ['synth', '808', 'melodic']
    },
    instrumentSignatures: ['dembow-rhythm', 'brass', 'reggaeton-synths'],
    productionEra: ['modern'],
    energyRange: { min: 6, max: 8 },
    characteristics: ['danceable', 'latin', 'rhythmic', 'party'],
    weight: 7
  },

  ambient: {
    name: 'Ambient',
    subgenres: ['Dark Ambient', 'Space Ambient', 'Drone', 'New Age'],
    bpmRange: { min: 60, max: 120, sweet: 80 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['5A', '6A', '7A', '8A', '4A']
    },
    drumPatterns: {
      kickStyle: ['sparse-or-none', 'soft'],
      hatStyle: ['none', 'sparse-textures'],
      snareStyle: ['none', 'textural'],
      swingRange: { min: 0, max: 100 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['drone', 'pad-washes', 'evolving'],
      bassType: ['sub', 'drone', 'none']
    },
    instrumentSignatures: ['pads', 'drones', 'field-recordings', 'granular'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 1, max: 4 },
    characteristics: ['atmospheric', 'spacious', 'meditative', 'evolving'],
    weight: 5
  },

  trance: {
    name: 'Trance',
    subgenres: ['Progressive Trance', 'Uplifting Trance', 'Psytrance', 'Vocal Trance'],
    bpmRange: { min: 138, max: 150, sweet: 140 },
    keyPreference: {
      preferMinor: true,
      commonKeys: ['8A', '7A', '9A', '6A', '10A']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'punchy-kick'],
      hatStyle: ['offbeat-16ths', 'rolling-hats'],
      snareStyle: ['clap-offbeat', 'layered-clap'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['medium'],
      commonProgressions: ['uplifting-progression', 'emotional-build'],
      bassType: ['rolling', '303-style', 'psy-bass']
    },
    instrumentSignatures: ['supersaw', 'pluck-leads', 'pads', 'arpeggios', 'vocals'],
    productionEra: ['modern', 'clean'],
    energyRange: { min: 7, max: 10 },
    characteristics: ['euphoric', 'emotional', 'build-drop', 'melodic'],
    weight: 7
  },

  edm: {
    name: 'EDM',
    subgenres: ['Big Room', 'Future Bass', 'Electro House', 'Dubstep'],
    bpmRange: { min: 125, max: 150, sweet: 128 },
    keyPreference: {
      preferMinor: false,
      commonKeys: ['10B', '11B', '8B', '9B', '6B']
    },
    drumPatterns: {
      kickStyle: ['4-on-the-floor', 'sidechain-kick'],
      hatStyle: ['build-hats', 'crash-heavy'],
      snareStyle: ['build-snare', 'big-room-clap'],
      swingRange: { min: 0, max: 10 }
    },
    harmonyProfile: {
      complexity: ['simple', 'medium'],
      commonProgressions: ['I-V-vi-IV', 'drop-chord'],
      bassType: ['sidechain', 'supersaw-bass', 'wobble']
    },
    instrumentSignatures: ['supersaw', 'drop', 'riser', 'impact', 'white-noise'],
    productionEra: ['modern'],
    energyRange: { min: 8, max: 10 },
    characteristics: ['high-energy', 'drop-focused', 'festival', 'mainstream'],
    weight: 6
  }
};

// =============================================================================
// Scoring Weights
// =============================================================================

const SCORING_WEIGHTS = {
  drumPatterns: 45,     // Drum grid first
  bpm: 20,              // Tempo / feel after drums
  harmony: 25,          // Bass lock vs drums lives here (bassType)
  keyScale: 4,
  instruments: 3,
  energy: 2,
  production: 1
};

// =============================================================================
// GenreAnalyzer Class
// =============================================================================

export class GenreAnalyzer {
  private characteristics: TrackCharacteristics;

  constructor(characteristics: TrackCharacteristics = {}) {
    this.characteristics = characteristics;
  }

  /**
   * Update characteristics
   */
  setCharacteristics(characteristics: Partial<TrackCharacteristics>): void {
    this.characteristics = { ...this.characteristics, ...characteristics };
  }

  private grooveFromCharacteristics() {
    const kick = String(this.characteristics.drums?.kickPattern || '').toLowerCase()
    let family: string = 'unknown'
    if (kick.includes('4-on') || kick.includes('four-on') || kick.includes('four on')) family = 'four-on-the-floor'
    else if (kick.includes('half')) family = 'half-time'
    else if (kick.includes('dembow') || kick.includes('reggaeton')) family = 'dembow'
    else if (kick.includes('one-drop') || kick.includes('one drop')) family = 'one-drop'
    else if (kick.includes('boom')) family = 'boom-bap'
    else if (kick.includes('break')) family = 'breakbeat'
    else if (kick.includes('sparse')) family = 'sparse'
    if (family === 'unknown') return null
    return classifyWithGenreEngine({
      bpm: this.characteristics.bpm,
      drumFamily: family,
      bass: { lock: this.characteristics.harmony?.bassType || 'unknown' },
      swingPercent: this.characteristics.drums?.swing,
    })
  }

  /**
   * Main analysis method - returns comprehensive genre analysis
   */
  analyze(): GenreAnalysisResult {
    const allScores = this.calculateAllGenreScores();
    
    // Sort by score descending
    allScores.sort((a, b) => b.score - a.score);

    const groove = this.grooveFromCharacteristics()
    if (groove && groove.confidence >= 0.55 && groove.primary !== 'Unclassified') {
      const grooveScore: GenreScore = {
        genre: groove.primary,
        subgenre: groove.subgenre || undefined,
        score: Math.round(groove.confidence * 100),
        confidence: groove.confidence >= 0.75 ? 'high' : 'medium',
        matchingFactors: groove.reason,
      }
      const rest = allScores.filter((g) => g.genre !== grooveScore.genre)
      return {
        primaryGenre: grooveScore,
        secondaryGenres: rest.slice(0, 3).filter((g) => g.score >= 30),
        allScores: [grooveScore, ...rest],
        characteristics: this.deriveCharacteristics(grooveScore),
        recommendations: this.generateRecommendations(grooveScore, rest.slice(0, 3)),
      }
    }
    
    const primaryGenre = allScores[0];
    const secondaryGenres = allScores.slice(1, 4).filter(g => g.score >= 30);
    
    return {
      primaryGenre,
      secondaryGenres,
      allScores,
      characteristics: this.deriveCharacteristics(primaryGenre),
      recommendations: this.generateRecommendations(primaryGenre, secondaryGenres)
    };
  }

  /**
   * Quick genre inference - returns just the genre name
   */
  inferGenre(): string {
    const result = this.analyze();
    return result.primaryGenre.genre;
  }

  /**
   * Quick subgenre inference
   */
  inferSubgenre(): string {
    const result = this.analyze();
    return result.primaryGenre.subgenre || result.primaryGenre.genre;
  }

  /**
   * Calculate scores for all genres
   */
  private calculateAllGenreScores(): GenreScore[] {
    return Object.entries(GENRE_PROFILES).map(([key, profile]) => {
      return this.scoreGenre(key, profile);
    });
  }

  /**
   * Score a single genre based on all factors
   */
  private scoreGenre(genreKey: string, profile: GenreProfile): GenreScore {
    let totalScore = 0;
    const matchingFactors: string[] = [];

    // 1. BPM Score (25 points)
    const bpmScore = this.scoreBpm(profile);
    totalScore += bpmScore.score;
    if (bpmScore.matched) matchingFactors.push(`BPM (${bpmScore.detail})`);

    // 2. Drum Pattern Score (25 points)
    const drumScore = this.scoreDrumPatterns(profile);
    totalScore += drumScore.score;
    if (drumScore.matched) matchingFactors.push(...drumScore.factors);

    // 3. Key/Scale Score (10 points)
    const keyScore = this.scoreKeyScale(profile);
    totalScore += keyScore.score;
    if (keyScore.matched) matchingFactors.push(`Key (${keyScore.detail})`);

    // 4. Harmony Score (10 points)
    const harmonyScore = this.scoreHarmony(profile);
    totalScore += harmonyScore.score;
    if (harmonyScore.matched) matchingFactors.push(...harmonyScore.factors);

    // 5. Instrument Score (15 points)
    const instrumentScore = this.scoreInstruments(profile);
    totalScore += instrumentScore.score;
    if (instrumentScore.matched) matchingFactors.push(...instrumentScore.factors);

    // 6. Energy Score (10 points)
    const energyScore = this.scoreEnergy(profile);
    totalScore += energyScore.score;
    if (energyScore.matched) matchingFactors.push(`Energy (${energyScore.detail})`);

    // 7. Production Score (5 points)
    const productionScore = this.scoreProduction(profile);
    totalScore += productionScore.score;
    if (productionScore.matched) matchingFactors.push(...productionScore.factors);

    // Apply genre base weight modifier
    totalScore = Math.min(100, totalScore * (profile.weight / 8));

    // Determine best subgenre
    const subgenre = this.determineSubgenre(profile, matchingFactors);

    return {
      genre: profile.name,
      subgenre,
      score: Math.round(totalScore),
      confidence: this.getConfidence(totalScore),
      matchingFactors
    };
  }

  /**
   * Score BPM match
   */
  private scoreBpm(profile: GenreProfile): { score: number; matched: boolean; detail: string } {
    const { bpm } = this.characteristics;
    if (!bpm) return { score: SCORING_WEIGHTS.bpm * 0.3, matched: false, detail: 'unknown' };

    const { min, max, sweet } = profile.bpmRange;
    
    // Perfect match at sweet spot
    if (Math.abs(bpm - sweet) <= 3) {
      return { score: SCORING_WEIGHTS.bpm, matched: true, detail: `${bpm} BPM (sweet spot)` };
    }
    
    // Within range
    if (bpm >= min && bpm <= max) {
      const rangeScore = SCORING_WEIGHTS.bpm * 0.8;
      return { score: rangeScore, matched: true, detail: `${bpm} BPM (in range)` };
    }
    
    // Close to range (within 10 BPM)
    if (bpm >= min - 10 && bpm <= max + 10) {
      return { score: SCORING_WEIGHTS.bpm * 0.4, matched: false, detail: `${bpm} BPM (close)` };
    }

    return { score: 0, matched: false, detail: `${bpm} BPM (out of range)` };
  }

  /**
   * Score drum patterns
   */
  private scoreDrumPatterns(profile: GenreProfile): { score: number; matched: boolean; factors: string[] } {
    const { drums } = this.characteristics;
    if (!drums) return { score: SCORING_WEIGHTS.drumPatterns * 0.3, matched: false, factors: [] };

    let score = 0;
    const factors: string[] = [];
    const maxScore = SCORING_WEIGHTS.drumPatterns;

    // Kick pattern match (40% of drum score)
    if (drums.kickPattern) {
      const kickLower = drums.kickPattern.toLowerCase();
      const kickMatch = profile.drumPatterns.kickStyle.some(k => 
        kickLower.includes(k.toLowerCase()) || k.toLowerCase().includes(kickLower)
      );
      if (kickMatch) {
        score += maxScore * 0.4;
        factors.push(`Kick: ${drums.kickPattern}`);
      }
    }

    // Hat pattern match (30% of drum score)
    if (drums.hatPattern) {
      const hatLower = drums.hatPattern.toLowerCase();
      const hatMatch = profile.drumPatterns.hatStyle.some(h => 
        hatLower.includes(h.toLowerCase()) || h.toLowerCase().includes(hatLower)
      );
      if (hatMatch) {
        score += maxScore * 0.3;
        factors.push(`Hats: ${drums.hatPattern}`);
      }
    }

    // Snare pattern match (20% of drum score)
    if (drums.snarePattern) {
      const snareLower = drums.snarePattern.toLowerCase();
      const snareMatch = profile.drumPatterns.snareStyle.some(s => 
        snareLower.includes(s.toLowerCase()) || s.toLowerCase().includes(snareLower)
      );
      if (snareMatch) {
        score += maxScore * 0.2;
        factors.push(`Snare: ${drums.snarePattern}`);
      }
    }

    // Swing match (10% of drum score)
    if (drums.swing !== undefined) {
      const { min, max } = profile.drumPatterns.swingRange;
      if (drums.swing >= min && drums.swing <= max) {
        score += maxScore * 0.1;
        factors.push(`Swing: ${drums.swing}%`);
      }
    }

    return { score, matched: factors.length > 0, factors };
  }

  /**
   * Score key/scale match
   */
  private scoreKeyScale(profile: GenreProfile): { score: number; matched: boolean; detail: string } {
    const { key } = this.characteristics;
    if (!key) return { score: SCORING_WEIGHTS.keyScale * 0.3, matched: false, detail: 'unknown' };

    const maxScore = SCORING_WEIGHTS.keyScale;
    const isMinor = key.includes('A');
    
    // Check if key matches preference
    if (profile.keyPreference.preferMinor === isMinor) {
      // Check if it's a common key for this genre
      if (profile.keyPreference.commonKeys.includes(key)) {
        return { score: maxScore, matched: true, detail: `${key} (common for genre)` };
      }
      return { score: maxScore * 0.7, matched: true, detail: `${key} (scale matches)` };
    }

    return { score: maxScore * 0.3, matched: false, detail: key };
  }

  /**
   * Score harmony characteristics
   */
  private scoreHarmony(profile: GenreProfile): { score: number; matched: boolean; factors: string[] } {
    const { harmony } = this.characteristics;
    if (!harmony) return { score: SCORING_WEIGHTS.harmony * 0.3, matched: false, factors: [] };

    let score = 0;
    const factors: string[] = [];
    const maxScore = SCORING_WEIGHTS.harmony;

    // Complexity match (20%) — color, not identity
    if (harmony.chordComplexity && profile.harmonyProfile.complexity.includes(harmony.chordComplexity)) {
      score += maxScore * 0.2;
      factors.push(`${harmony.chordComplexity} harmony`);
    }

    // Bass type match (70%) — bass vs drum grid is the subgenre lock
    if (harmony.bassType) {
      const bassLower = harmony.bassType.toLowerCase();
      const bassMatch = profile.harmonyProfile.bassType.some(b => 
        bassLower.includes(b.toLowerCase()) || b.toLowerCase().includes(bassLower)
      );
      if (bassMatch) {
        score += maxScore * 0.7;
        factors.push(`Bass: ${harmony.bassType}`);
      }
    }

    // Pad textures (20%)
    if (harmony.padTextures && profile.instrumentSignatures.includes('pads')) {
      score += maxScore * 0.2;
      factors.push('Pad textures');
    }

    return { score, matched: factors.length > 0, factors };
  }

  /**
   * Score instrument signatures
   */
  private scoreInstruments(profile: GenreProfile): { score: number; matched: boolean; factors: string[] } {
    const { instruments } = this.characteristics;
    if (!instruments) return { score: SCORING_WEIGHTS.instruments * 0.2, matched: false, factors: [] };

    const factors: string[] = [];
    const maxScore = SCORING_WEIGHTS.instruments;
    let matchCount = 0;

    // Check each instrument signature
    const instrumentMap: Record<string, boolean | undefined> = {
      '808': instruments.has808,
      '808-bass': instruments.has808,
      'acid': instruments.hasAcidBass,
      'acid-303': instruments.hasAcidBass,
      'acoustic-drums': instruments.hasAcousticDrums,
      'strings': instruments.hasStrings,
      'pads': instruments.hasPads,
      'vocal-chops': instruments.hasChoppedVocals,
      'chopped-vocals': instruments.hasChoppedVocals,
      'synth': instruments.hasSynthLead,
      'organ': instruments.hasOrgan,
      'piano': instruments.hasPiano,
      'rhodes': instruments.hasPiano,
      'guitar': instruments.hasGuitar,
      'wah-guitar': instruments.hasGuitar
    };

    for (const sig of profile.instrumentSignatures) {
      const sigLower = sig.toLowerCase();
      for (const [key, value] of Object.entries(instrumentMap)) {
        if (value && sigLower.includes(key)) {
          matchCount++;
          factors.push(sig);
          break;
        }
      }
    }

    const score = maxScore * Math.min(1, matchCount / Math.max(2, profile.instrumentSignatures.length / 2));
    return { score, matched: factors.length > 0, factors };
  }

  /**
   * Score energy level
   */
  private scoreEnergy(profile: GenreProfile): { score: number; matched: boolean; detail: string } {
    const { energy } = this.characteristics;
    if (!energy) return { score: SCORING_WEIGHTS.energy * 0.3, matched: false, detail: 'unknown' };

    const { min, max } = profile.energyRange;
    const maxScore = SCORING_WEIGHTS.energy;

    if (energy >= min && energy <= max) {
      return { score: maxScore, matched: true, detail: `Level ${energy}` };
    }

    // Close match (within 2)
    if (energy >= min - 2 && energy <= max + 2) {
      return { score: maxScore * 0.5, matched: false, detail: `Level ${energy} (close)` };
    }

    return { score: 0, matched: false, detail: `Level ${energy}` };
  }

  /**
   * Score production characteristics
   */
  private scoreProduction(profile: GenreProfile): { score: number; matched: boolean; factors: string[] } {
    const { production } = this.characteristics;
    if (!production) return { score: SCORING_WEIGHTS.production * 0.3, matched: false, factors: [] };

    let score = 0;
    const factors: string[] = [];
    const maxScore = SCORING_WEIGHTS.production;

    // Era match (60%)
    if (production.era && profile.productionEra.includes(production.era)) {
      score += maxScore * 0.6;
      factors.push(`${production.era} production`);
    }

    // Build/drop for EDM genres (40%)
    if (production.buildDrop && ['edm', 'trance', 'dubstep'].some(g => 
      profile.name.toLowerCase().includes(g)
    )) {
      score += maxScore * 0.4;
      factors.push('Build/drop structure');
    }

    // Sidechaining for electronic genres (40%)
    if (production.sidechaining && profile.instrumentSignatures.some(s => 
      s.includes('sidechain') || s.includes('pump')
    )) {
      score += maxScore * 0.4;
      factors.push('Sidechain compression');
    }

    return { score: Math.min(maxScore, score), matched: factors.length > 0, factors };
  }

  /**
   * Determine best subgenre based on matching factors
   */
  private determineSubgenre(profile: GenreProfile, matchingFactors: string[]): string | undefined {
    // Simple heuristic - could be expanded
    const factorsStr = matchingFactors.join(' ').toLowerCase();
    
    for (const subgenre of profile.subgenres) {
      const subLower = subgenre.toLowerCase().replace(/[^a-z]/g, '');
      if (factorsStr.includes(subLower)) {
        return subgenre;
      }
    }

    // Return first subgenre as default if good match
    if (matchingFactors.length >= 3) {
      return profile.subgenres[0];
    }

    return undefined;
  }

  /**
   * Get confidence level from score
   */
  private getConfidence(score: number): 'low' | 'medium' | 'high' {
    if (score >= 70) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  }

  /**
   * Derive track characteristics from primary genre
   */
  private deriveCharacteristics(primary: GenreScore): {
    tempo: string;
    mood: string;
    danceability: string;
    production: string;
  } {
    const profile = GENRE_PROFILES[primary.genre.toLowerCase().replace(/[^a-z]/g, '_')] || 
                    Object.values(GENRE_PROFILES).find(p => p.name === primary.genre);
    
    if (!profile) {
      return {
        tempo: 'moderate',
        mood: 'neutral',
        danceability: 'moderate',
        production: 'modern'
      };
    }

    const bpm = this.characteristics.bpm || profile.bpmRange.sweet;
    
    return {
      tempo: bpm < 100 ? 'slow' : bpm < 125 ? 'moderate' : bpm < 140 ? 'fast' : 'very fast',
      mood: profile.keyPreference.preferMinor ? 'dark/moody' : 'bright/uplifting',
      danceability: profile.energyRange.max >= 7 ? 'high' : profile.energyRange.max >= 5 ? 'moderate' : 'low',
      production: profile.productionEra[0]
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(primary: GenreScore, secondary: GenreScore[]): {
    mixableWith: string[];
    similarArtists: string[];
    productionTips: string[];
  } {
    const mixableWith: string[] = [];
    const productionTips: string[] = [];

    // Add secondary genres as mixable
    secondary.forEach(g => mixableWith.push(g.genre));

    // Add genre-specific recommendations
    const genreKey = primary.genre.toLowerCase().replace(/[^a-z]/g, '_');
    const profile = GENRE_PROFILES[genreKey];

    if (profile) {
      // Production tips based on characteristics
      profile.characteristics.forEach(c => {
        productionTips.push(`Focus on ${c} elements`);
      });

      // Add instrument recommendations
      if (profile.instrumentSignatures.length > 0) {
        productionTips.push(`Key sounds: ${profile.instrumentSignatures.slice(0, 3).join(', ')}`);
      }
    }

    // Similar artists would require a database - placeholder
    const similarArtists = this.getSimilarArtists(primary.genre);

    return {
      mixableWith: mixableWith.slice(0, 4),
      similarArtists,
      productionTips: productionTips.slice(0, 4)
    };
  }

  /**
   * Get similar artists for a genre (could be expanded with real data)
   */
  private getSimilarArtists(genre: string): string[] {
    const artistMap: Record<string, string[]> = {
      'House': ['Disclosure', 'Duke Dumont', 'MK'],
      'Tech House': ['Fisher', 'Chris Lake', 'Patrick Topping'],
      'Deep House': ['Kerri Chandler', 'Larry Heard', 'Moodymann'],
      'Techno': ['Amelie Lens', 'Charlotte de Witte', 'Adam Beyer'],
      'Hip-Hop': ['J Dilla', 'Madlib', 'The Alchemist'],
      'Boom Bap': ['DJ Premier', '9th Wonder', 'Pete Rock'],
      'Trap': ['Metro Boomin', 'Southside', 'Lex Luger'],
      'Lo-Fi': ['Nujabes', 'J Dilla', 'Tomppabeats'],
      'Funk': ['Prince', 'Earth Wind & Fire', 'Bootsy Collins'],
      'Disco': ['Daft Punk', 'Purple Disco Machine', 'Breakbot'],
      'Soul': ['D\'Angelo', 'Erykah Badu', 'Anderson .Paak'],
      'Drum & Bass': ['Andy C', 'Sub Focus', 'Pendulum'],
    };

    return artistMap[genre] || [];
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick genre inference from basic characteristics
 */
export function inferGenre(
  bpm?: number,
  drums?: TrackCharacteristics['drums'],
  key?: string,
  energy?: number
): string {
  const analyzer = new GenreAnalyzer({ bpm, drums, key, energy });
  return analyzer.inferGenre();
}

/**
 * Full analysis from track data
 */
export function analyzeGenre(characteristics: TrackCharacteristics): GenreAnalysisResult {
  const analyzer = new GenreAnalyzer(characteristics);
  return analyzer.analyze();
}

/**
 * Extract characteristics from sonic_dna JSON
 */
export function extractCharacteristicsFromSonicDna(sonicDna: any): TrackCharacteristics {
  if (!sonicDna) return {};
  
  const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna;
  const measured = dna?.measured;

  return {
    bpm: measured?.bpm || dna?.bpm || dna?.tempo?.bpm || dna?.audioFeatures?.bpm,
    key: measured?.camelot || measured?.key || dna?.key || dna?.harmony?.key || dna?.audioFeatures?.key,
    energy: dna?.energy || dna?.audioFeatures?.energy || dna?.mood?.energy,
    drums: {
      kickPattern:
        measured?.drumFamily === 'four-on-the-floor'
          ? '4-on-the-floor'
          : measured?.drumFamily || dna?.drums?.kickPattern || dna?.drums?.patternType || dna?.comprehensive?.drums?.kickPattern,
      hatPattern: measured?.percussion?.hatGrid || dna?.drums?.hihatPattern || dna?.drums?.hatStyle || dna?.comprehensive?.drums?.hihatPattern,
      snarePattern:
        measured?.percussion?.snareRole ||
        (measured?.drumFamily === 'half-time'
          ? 'halftime-backbeat'
          : dna?.drums?.snarePattern || dna?.drums?.snareStyle),
      swing: measured?.swingPercent ?? dna?.drums?.swing ?? dna?.drums?.groove?.swing,
      complexity: dna?.drums?.complexity
    },
    harmony: {
      chordComplexity: dna?.harmony?.complexity || dna?.comprehensive?.harmony?.complexity,
      progression: dna?.harmony?.progression || dna?.comprehensive?.harmony?.chordProgression,
      bassType: measured?.bass?.lock || dna?.bass?.type || dna?.comprehensive?.bass?.character,
      padTextures:
        (measured?.instruments || []).some((item: { id?: string }) => item.id === 'harmonic-pad') ||
        !!dna?.instruments?.pads ||
        !!dna?.comprehensive?.instruments?.pads
    },
    instruments: {
      has808: measured?.bass?.lock === 'sparse-808' || dna?.instruments?.has808 || dna?.bass?.type?.includes('808'),
      hasAcidBass: dna?.instruments?.acid || dna?.bass?.type?.includes('acid'),
      hasAcousticDrums: dna?.drums?.isAcoustic,
      hasStrings: !!dna?.instruments?.strings,
      hasPads:
        (measured?.instruments || []).some((item: { id?: string }) => item.id === 'harmonic-pad') ||
        !!dna?.instruments?.pads,
      hasChoppedVocals: dna?.vocals?.chopped,
      hasSynthLead:
        (measured?.instruments || []).some((item: { id?: string }) => item.id === 'mid-lead') ||
        !!dna?.instruments?.synthLead,
      hasOrgan: !!dna?.instruments?.organ,
      hasPiano: !!dna?.instruments?.piano || !!dna?.instruments?.rhodes,
      hasGuitar:
        (measured?.instruments || []).some((item: { id?: string }) => item.id === 'plucked-mid') ||
        !!dna?.instruments?.guitar
    },
    production: {
      era: dna?.production?.era || dna?.comprehensive?.production?.era,
      warmth: dna?.production?.warmth,
      spaceReverb: dna?.production?.reverb || dna?.production?.space,
      sidechaining: dna?.production?.sidechaining,
      buildDrop: dna?.structure?.hasDrop || dna?.comprehensive?.structure?.hasBuildDrop
    },
    vocals: {
      type: dna?.vocals?.type,
      prominence: dna?.vocals?.prominence
    }
  };
}

export default GenreAnalyzer;
