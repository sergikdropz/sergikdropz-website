/**
 * Dual-deck DJ mix engine — types & contracts.
 * MusicPlayer / DJMixerMode should share this instead of inline setInterval fades.
 */

export type DeckId = 'a' | 'b'

export type MixCurve = 'equal-power' | 'linear' | 'cut'

export type MixStyle = 'crossfade' | 'filter-eq' | 'bass-swap' | 'cut'

/** Phrase length used for Auto DJ overlap (bars @ 4/4). */
export type PhraseBars = 2 | 4 | 8 | 16 | 32

/** Mix-out section depth — always snapped on 8-bar DNA phrase increments. */
export type OutPhraseBars = PhraseBars | 24

/** Incoming mix-in grid; 0 disables phrase snapping on the incoming deck. */
export type InPhraseBars = PhraseBars | 0

/** Cue points in seconds on a loaded track. */
export type DeckCues = {
  /** First usable downbeat / grid origin */
  gridOffsetSec: number
  /** Preferred mix-in (intro phrase start) */
  mixInSec: number
  /** Preferred mix-out (outro phrase start) */
  mixOutSec: number
  /** Track duration when known */
  durationSec: number | null
  bpm: number | null
  phraseBars: PhraseBars
}

export type MixPlan = {
  outgoingTrackId: string
  incomingTrackId: string
  /** When to start the transition on the outgoing deck (absolute track time) */
  startAtOutgoingSec: number
  /** Waveform OUT marker — same as startAt when lead-in is prepare-only */
  mixOutMarkerSec?: number
  /** Incoming deck seek position at transition start */
  incomingStartSec: number
  /** Overlap length in seconds (outro phrase ↔ intro phrase) */
  mixDurationSec: number
  /** Prepare-only pre-roll; does not move startAtOutgoingSec */
  prepareLeadInSec?: number
  /** BPM ratio applied to incoming: outgoingBpm / incomingBpm */
  rateRatio: number
  style: MixStyle
  curve: MixCurve
  /** Mix-out section depth (8/16/24/32 bars); snap grid is always 8-bar DNA phrase */
  outPhraseBars: OutPhraseBars
  /** Bars @ 4/4 for mix-in phrase alignment on incoming deck (0 = off) */
  inPhraseBars: InPhraseBars
  /** Bars @ 4/4 for crossfade overlap length */
  overlapBars: PhraseBars
  /** @deprecated use overlapBars */
  phraseBars: PhraseBars
  reason: string
  /** Min BPM confidence of the pair (0–1); missing DNA → low, not 0.7 */
  dnaConfidence?: number
  /** False when DNA is too weak for kick/phrase snap */
  phraseLock?: boolean
  /**
   * Pocket/transient-resolved incoming cue. Consumers must prefer this over
   * `incomingStartSec` so prepare/start do not undo lead-in alignment.
   */
  resolvedIncomingSec?: number
  /** Loop last 8-bar phrase on outgoing if mix starts late */
  needsOutroLoop?: boolean
  /** Pre-fader synced delay on outgoing */
  echoSend?: boolean
  /** Incoming pitch offset for WASM key-lock path */
  harmonicSemitones?: number
  /** When true, keep BeatSync lock later in the overlap (match-outgoing) */
  holdBeatmatch?: boolean
  /**
   * Dual-deck master tempo handoff: both decks follow masterBpm → incoming native.
   * Default true for Auto DJ doctrine.
   */
  masterTempoHandoff?: boolean
  /**
   * Keep incoming cue on phrase 1 (±½ beat only). Default true for Auto DJ.
   */
  phrase1Lock?: boolean
  /** Force audible blend from progress 0 (no incomingDelay). */
  blendFromOut?: boolean
  /** Keep overlap at exact N×8 master bars (Auto DJ doctrine). */
  exactOverlap?: boolean
}

export type MixEngineStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'mixing'
  | 'error'

export type MixEngineEvent =
  | { type: 'status'; status: MixEngineStatus }
  | { type: 'active-deck'; deck: DeckId; trackId: string | null }
  | { type: 'mix-started'; plan: MixPlan }
  | { type: 'mix-completed'; plan: MixPlan; activeDeck: DeckId }
  | { type: 'mix-quality'; plan: MixPlan; phaseRmsSec: number; kickResidualRmsMs: number; samples: number }
  | { type: 'error'; message: string }

export type MixTrackRef = {
  id: string
  title?: string
  file: string
  trackKey?: string
  bpm?: number | null
  beat_grid_offset?: number | null
  sonic_dna?: unknown
  duration?: number | null
  /** 0–1 normalized energy (DB or DNA) — overlap shaping */
  energy_level?: number | null
  hotCues?: Array<{ timeSec: number; label?: string }>
  waveformPeaks?: Array<number | { positive?: number; negative?: number; rms?: number }>
  waveformDurationSec?: number
}
