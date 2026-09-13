/**
 * SERGIK Data Types
 * TypeScript interfaces for SERGIK music data and DNA systems
 */

// =============================================================================
// Artist Profile
// =============================================================================

export interface ArtistProfile {
  primaryName: string;
  legalName: string;
  aliases: string[];
  activePeriod: {
    start: number;
    end: number | null;
  };
  primaryDaw: string;
  genres: string[];
}

// =============================================================================
// Catalog Statistics
// =============================================================================

export interface CatalogStats {
  totalAbletonProjects: number;
  finishedExports: number;
  itunesLibraryTotal: number;
  sergikProductions: number;
  influenceLibrary: number;
  trainingReadyTracks: number;
  totalDurationHours: number;
  totalStorageGB: number;
  soloProductions: number;
  collaborations: number;
  remixesVips: number;
  uniqueCollaborators: number;
}

export interface ProductionYear {
  year: number;
  projects: number;
}

// =============================================================================
// Musical DNA
// =============================================================================

export interface BpmZone {
  label: string;
  range: string;
  percentage: number;
  color: string;
}

export interface BpmProfile {
  averageBpm: number;
  sweetSpot: { min: number; max: number };
  zones: BpmZone[];
}

export interface CamelotKey {
  key: string;           // e.g., "10B"
  musicalKey: string;    // e.g., "D major"
  percentage: number;
  character: string;
}

export interface KeyProfile {
  camelot: CamelotKey[];
  harmonicZones: {
    majorZone: { keys: string[]; percentage: number };
    minorZone: { keys: string[]; percentage: number };
  };
}

export interface EnergyLevel {
  level: string;
  percentage: number;
  description: string;
}

export interface EnergyProfile {
  average: number;
  sweetSpot: { min: number; max: number };
  distribution: EnergyLevel[];
}

export interface GenreDna {
  genre: string;
  percentage: number;
  color: string;
}

export interface TaggedGenre {
  genre: string;
  tracks: number;
}

export interface MusicalDna {
  bpmProfile: BpmProfile;
  keyProfile: KeyProfile;
  energyProfile: EnergyProfile;
  genreDna: GenreDna[];
  taggedGenres: TaggedGenre[];
}

// =============================================================================
// Collaborators
// =============================================================================

export interface Collaborator {
  name: string;
  projects: number;
  influence: string | null;
}

// =============================================================================
// Production Style
// =============================================================================

export interface ProductionPhilosophy {
  name: string;
  description: string;
}

export interface GenreRecommendation {
  bpm: string;
  key: string;
  energy: string;
}

export interface ProductionStyle {
  philosophy: ProductionPhilosophy[];
  recommendations: {
    house: GenreRecommendation;
    hipHop: GenreRecommendation;
    funkFusion: GenreRecommendation;
    techHouse: GenreRecommendation;
  };
}

// =============================================================================
// DJ Mixing
// =============================================================================

export interface KeyTransition {
  to: string;
  effect: string;
}

export interface BpmTransition {
  from: number;
  to: number;
  technique: string;
}

export interface DjMixing {
  keyTransitionsFrom10B: KeyTransition[];
  bpmTransitions: BpmTransition[];
  mixingTip: string;
}

// =============================================================================
// Quality Standards
// =============================================================================

export interface QualityTier {
  tier: number;
  quality: string;
  format: string;
  bitDepth: number | null;
  status: string;
}

export interface MasteringTarget {
  target: number;
  unit: string;
  tolerance?: number;
  max?: number;
  min?: number;
}

export interface QualityStandards {
  tiers: QualityTier[];
  masteringTargets: {
    integratedLoudness: MasteringTarget;
    truePeak: MasteringTarget;
    dynamicRange: MasteringTarget;
    stereoCorrelation: { min: number };
  };
}

// =============================================================================
// Tools
// =============================================================================

export interface ProductionTools {
  daw: string;
  customDevices: string[];
  templates: string[];
  audioEffects: string[];
  midiEffects: string[];
}

// =============================================================================
// Complete Artist Data
// =============================================================================

export interface SergikArtistData {
  artist: ArtistProfile;
  catalogStats: CatalogStats;
  productionTimeline: ProductionYear[];
  musicalDna: MusicalDna;
  collaborators: Collaborator[];
  productionStyle: ProductionStyle;
  djMixing: DjMixing;
  qualityStandards: QualityStandards;
  sampleTracks: string[];
  tools: ProductionTools;
  metadata: {
    source: string;
    lastUpdated: string;
    dataVersion: string;
  };
}

// =============================================================================
// Music Theory Constants
// =============================================================================

export interface CamelotKeyInfo {
  name: string;
  notes: string[];
}

export const CAMELOT_KEYS: Record<string, CamelotKeyInfo> = {
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
  '12B': { name: 'E Major', notes: ['E', 'F#', 'G#', 'A', 'B'] },
};

// =============================================================================
// Key Compatibility
// =============================================================================

export const KEY_TRANSITIONS: Record<string, string[]> = {
  '1A': ['12A', '2A', '1B'],
  '2A': ['1A', '3A', '2B'],
  '3A': ['2A', '4A', '3B'],
  '4A': ['3A', '5A', '4B'],
  '5A': ['4A', '6A', '5B'],
  '6A': ['5A', '7A', '6B'],
  '7A': ['6A', '8A', '7B', '10B'], // +10B parallel major
  '8A': ['7A', '9A', '8B'],
  '9A': ['8A', '10A', '9B'],
  '10A': ['9A', '11A', '10B'],
  '11A': ['10A', '12A', '11B'],
  '12A': ['11A', '1A', '12B'],
  '1B': ['12B', '2B', '1A'],
  '2B': ['1B', '3B', '2A'],
  '3B': ['2B', '4B', '3A'],
  '4B': ['3B', '5B', '4A'],
  '5B': ['4B', '6B', '5A'],
  '6B': ['5B', '7B', '6A'],
  '7B': ['6B', '8B', '7A'],
  '8B': ['7B', '9B', '8A'],
  '9B': ['8B', '10B', '9A'],
  '10B': ['9B', '11B', '10A', '7A'], // +7A parallel minor
  '11B': ['10B', '12B', '11A'],
  '12B': ['11B', '1B', '12A'],
};

// =============================================================================
// Drum Generation
// =============================================================================

export type DrumGenre = 
  | 'house' 
  | 'tech_house' 
  | 'techno' 
  | 'hiphop' 
  | 'boom_bap'
  | 'trap' 
  | 'dnb' 
  | 'jungle' 
  | 'reggaeton' 
  | 'dembow'
  | 'ambient' 
  | 'downtempo' 
  | 'lo_fi';

export const DRUM_GENRES: DrumGenre[] = [
  'house', 'tech_house', 'techno', 'hiphop', 'boom_bap',
  'trap', 'dnb', 'jungle', 'reggaeton', 'dembow',
  'ambient', 'downtempo', 'lo_fi'
];

export const DRUM_GENRE_DESCRIPTIONS: Record<DrumGenre, string> = {
  house: 'Classic 4-on-the-floor house pattern',
  tech_house: 'Tech house with syncopated hats and percs',
  techno: 'Minimal techno with sparse elements',
  hiphop: 'Classic boom bap hip-hop',
  boom_bap: 'Classic boom bap hip-hop',
  trap: 'Modern trap with 808s and hi-hat rolls',
  dnb: 'Drum and bass / jungle breakbeat',
  jungle: 'Jungle breakbeat',
  reggaeton: 'Reggaeton dembow rhythm',
  dembow: 'Dembow rhythm',
  ambient: 'Sparse ambient/downtempo',
  downtempo: 'Downtempo beats',
  lo_fi: 'Lo-fi hip-hop beats'
};

export const GM_DRUM_MAP: Record<string, number> = {
  kick: 36,
  kick_alt: 35,
  snare: 38,
  snare_rim: 37,
  snare_alt: 40,
  clap: 39,
  closed_hat: 42,
  open_hat: 46,
  pedal_hat: 44,
  crash: 49,
  ride: 51,
  ride_bell: 53,
  tom_low: 45,
  tom_mid: 47,
  tom_high: 50,
  floor_tom: 41,
  tambourine: 54,
  cowbell: 56,
  conga_high: 63,
  conga_low: 64,
  bongo_high: 60,
  bongo_low: 61,
  shaker: 70,
  maracas: 70,
  clave: 75,
  wood_block: 76,
  perc_1: 67,
  perc_2: 68,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get compatible keys for mixing
 */
export function getCompatibleKeys(key: string): string[] {
  return KEY_TRANSITIONS[key] || [];
}

/**
 * Check if two keys are compatible for mixing
 */
export function areKeysCompatible(key1: string, key2: string): boolean {
  return KEY_TRANSITIONS[key1]?.includes(key2) || false;
}

/**
 * Get key info from Camelot notation
 */
export function getKeyInfo(camelotKey: string): CamelotKeyInfo | null {
  return CAMELOT_KEYS[camelotKey] || null;
}

/**
 * Determine if a BPM is in SERGIK's sweet spot
 */
export function isInBpmSweetSpot(bpm: number): boolean {
  return (bpm >= 120 && bpm <= 127) || (bpm >= 80 && bpm <= 90);
}

/**
 * Get BPM zone label
 */
export function getBpmZone(bpm: number): string {
  if (bpm < 90) return 'Downtempo/Hip-Hop';
  if (bpm < 100) return 'Hip-Hop/Funk';
  if (bpm < 110) return 'Transitional';
  if (bpm < 120) return 'Funk/House';
  if (bpm < 130) return 'House/Tech House';
  if (bpm < 140) return 'Techno';
  return 'DnB/Experimental';
}

/**
 * Calculate DNA match score (0-100)
 */
export function calculateDnaMatch(
  bpm: number,
  key: string,
  energy: number
): number {
  let score = 0;
  
  // BPM score (40 points max)
  if (bpm >= 120 && bpm <= 129) score += 40;
  else if (bpm < 90) score += 35;
  else if (bpm >= 110 && bpm < 120) score += 20;
  else score += 10;
  
  // Key score (40 points max)
  const primaryKeys = ['10B', '11B'];
  const secondaryKeys = ['7A', '8A'];
  if (primaryKeys.includes(key)) score += 40;
  else if (secondaryKeys.includes(key)) score += 30;
  else score += 15;
  
  // Energy score (20 points max)
  if (energy >= 5 && energy <= 7) score += 20;
  else if (energy >= 4 && energy <= 8) score += 10;
  else score += 5;
  
  return score;
}
