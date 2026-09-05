/**
 * Shared Sonic DNA agent blackboard — polymath collaboration bus.
 *
 * Parallel specialists read measured facts + genre encyclopedia slices,
 * write claims onto the board, and narrative agents quote the grid.
 * Downstream enrich (`applyGenreEncyclopedia`) remains authoritative for
 * encyclopedia layers; agents must not invent DSP that contradicts measured.
 */

import type { SonicDnaMeasured } from '@/lib/audio/sonic-dna-quality'
import { QUOTE_THE_GRID_RULE, type EvidenceClaim } from '@/lib/audio/sonic-dna-v2/evidence-ledger'
import kbJson from '@/lib/audio/data/genre-intelligence.json'
import { classifyMeasuredWithGenreEngine } from '@/lib/audio/genre-engine'

/** Agent type ids as strings to avoid circular import with agentTypes.ts */
export type BlackboardAgentId = string

type GenreProfile = {
  family?: string
  related?: string[]
  emotions?: string[]
  regions?: string[]
  eras?: string[]
  history?: string
  culture?: string
  psychology?: string
  theory?: string
  production?: string
}

type GenreKb = {
  version?: string
  method?: string
  science?: Record<string, string>
  profiles?: Record<string, GenreProfile>
}

const KB = kbJson as GenreKb

const PRIMARY_ALIASES: Record<string, string> = {
  'dub reggae': 'Reggae',
  dub: 'Reggae',
  'funky house': 'Funky House',
  'deep n funky': 'Funky House',
  'tech house': 'Tech House',
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  trap: 'Hip-Hop',
}

export type KbSlice = {
  primary: string
  family: string
  subgenre?: string | null
  profileExcerpt: string
  scienceNotes: string[]
  related: string[]
  emotions: string[]
  regions: string[]
  eras: string[]
  kbVersion?: string
  method?: string
}

export type AgentBlackboard = {
  version: 1
  trackId: string
  trackTitle: string
  artistName: string
  measured: Partial<SonicDnaMeasured>
  kb: KbSlice | null
  evidence: EvidenceClaim[]
  agentOutputs: Partial<Record<BlackboardAgentId, unknown>>
  conflicts: Array<{ field: string; a: unknown; b: unknown; note?: string }>
  wavesCompleted: string[]
  updatedAt: string
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function resolvePrimary(raw: string | null | undefined): string {
  const text = String(raw || '').trim()
  if (!text) return 'Unclassified'
  const alias = PRIMARY_ALIASES[text.toLowerCase()]
  if (alias) return alias
  const profiles = KB.profiles || {}
  if (profiles[text]) return text
  const match = Object.keys(profiles).find((key) => key.toLowerCase() === text.toLowerCase())
  return match || text
}

function profileFor(primary: string, family: string): GenreProfile {
  const profiles = KB.profiles || {}
  return profiles[primary] || profiles[family] || profiles.Unclassified || {}
}

/** Resolve peer agent payload whether stored as bare data or AgentResult-shaped. */
export function peerAgentData(
  previous: Record<string, any> | undefined,
  type: BlackboardAgentId,
): Record<string, any> | null {
  const raw = previous?.[type]
  if (!raw || typeof raw !== 'object') return null
  if (raw.data !== undefined && (raw.agentType || raw.success !== undefined)) {
    return asRecord(raw.data)
  }
  return asRecord(raw)
}

export function buildKbSlice(input: {
  primary?: string | null
  family?: string | null
  subgenre?: string | null
  drumFamily?: string | null
}): KbSlice {
  const primary = resolvePrimary(input.primary || input.family || 'Unclassified')
  const family = String(input.family || profileFor(primary, primary).family || primary)
  const prof = profileFor(primary, family)
  const science = KB.science || {}
  const drum = String(input.drumFamily || '').toLowerCase()
  const scienceNotes = [
    science.activationFormula,
    science.socialCoupling,
    science.modeValence,
    drum.includes('four') ? science.entrainment : null,
    drum.includes('half') || drum.includes('boom') ? science.halfTime : null,
    primary === 'Reggae' ? science.delaySpace : null,
    science.syncopation,
    science.subBass,
  ].filter(Boolean) as string[]

  const excerptParts = [
    prof.history ? `History: ${String(prof.history).slice(0, 420)}` : null,
    prof.culture ? `Culture: ${String(prof.culture).slice(0, 320)}` : null,
    prof.psychology ? `Psychology: ${String(prof.psychology).slice(0, 280)}` : null,
    prof.theory ? `Theory: ${String(prof.theory).slice(0, 220)}` : null,
    prof.production ? `Production: ${String(prof.production).slice(0, 220)}` : null,
  ].filter(Boolean)

  return {
    primary,
    family,
    subgenre: input.subgenre || null,
    profileExcerpt: excerptParts.join('\n') || `Encyclopedia profile for ${primary} / ${family}.`,
    scienceNotes: scienceNotes.slice(0, 5),
    related: (prof.related || []).slice(0, 10),
    emotions: (prof.emotions || []).slice(0, 6),
    regions: (prof.regions || []).slice(0, 6),
    eras: (prof.eras || []).slice(0, 6),
    kbVersion: KB.version,
    method: KB.method,
  }
}

/** Seed measured + KB from pre-agent analysis (comprehensive / enhanced / metadata). */
export function createBlackboard(input: {
  trackId: string
  trackTitle: string
  artistName: string
  bpm?: number | null
  key?: string | null
  timingFeel?: string | null
  effectiveBpm?: number | null
  drumFamily?: string | null
  kickSteps?: number[]
  snareSteps?: number[]
  hatSteps?: number[]
  bassLock?: string | null
  primaryGenre?: string | null
  subgenre?: string | null
  genreFamily?: string | null
}): AgentBlackboard {
  const measured: Partial<SonicDnaMeasured> = {
    bpm: input.bpm ?? null,
    bpmConfidence: input.bpm != null ? 0.75 : 0,
    timingFeel: input.timingFeel || undefined,
    effectiveBpm: input.effectiveBpm ?? input.bpm ?? null,
    drumFamily: input.drumFamily || null,
    kickSteps: input.kickSteps || [],
    snareSteps: input.snareSteps || [],
    hatSteps: input.hatSteps || [],
    key: input.key || null,
    keyConfidence: input.key ? 0.55 : 0,
    bass: input.bassLock ? { lock: input.bassLock } : undefined,
    genre: {
      primary: input.primaryGenre || undefined,
      subgenre: input.subgenre || undefined,
      family: input.genreFamily || undefined,
      source: input.primaryGenre ? 'audio-measured' : undefined,
    },
  }

  const kb = buildKbSlice({
    primary: input.primaryGenre,
    family: input.genreFamily || input.primaryGenre,
    subgenre: input.subgenre,
    drumFamily: input.drumFamily,
  })

  return {
    version: 1,
    trackId: input.trackId,
    trackTitle: input.trackTitle,
    artistName: input.artistName,
    measured,
    kb,
    evidence: [],
    agentOutputs: {},
    conflicts: [],
    wavesCompleted: [],
    updatedAt: new Date().toISOString(),
  }
}

export function appendBlackboardEvidence(
  board: AgentBlackboard,
  claim: EvidenceClaim,
): AgentBlackboard {
  return {
    ...board,
    evidence: [...board.evidence, claim],
    updatedAt: new Date().toISOString(),
  }
}

export function recordAgentOutput(
  board: AgentBlackboard,
  type: BlackboardAgentId,
  data: unknown,
): AgentBlackboard {
  return {
    ...board,
    agentOutputs: { ...board.agentOutputs, [type]: data },
    updatedAt: new Date().toISOString(),
  }
}

export function markWaveComplete(board: AgentBlackboard, waveId: string): AgentBlackboard {
  if (board.wavesCompleted.includes(waveId)) return board
  return {
    ...board,
    wavesCompleted: [...board.wavesCompleted, waveId],
    updatedAt: new Date().toISOString(),
  }
}

/** Prompt block every polymath agent should see. */
export function formatBlackboardPrompt(board: AgentBlackboard | null | undefined): string {
  if (!board) return ''
  const m = board.measured
  const kb = board.kb
  const facts = [
    m?.bpm != null ? `BPM: ${Math.round(Number(m.bpm))}${m.timingFeel ? ` (${m.timingFeel})` : ''}` : null,
    m?.drumFamily ? `Drums: ${m.drumFamily}` : null,
    Array.isArray(m?.kickSteps) && m.kickSteps.length ? `Kick steps: [${m.kickSteps.slice(0, 8).join(',')}]` : null,
    Array.isArray(m?.snareSteps) && m.snareSteps.length ? `Snare steps: [${m.snareSteps.slice(0, 8).join(',')}]` : null,
    m?.key ? `Key: ${m.key}` : null,
    m?.bass?.lock ? `Bass lock: ${m.bass.lock}` : null,
    m?.genre?.audioPrimary
      ? `Audio class: ${m.genre.audioPrimary}${m.genre.audioSubgenre ? ` / ${m.genre.audioSubgenre}` : ''}`
      : kb
        ? `Groove class: ${kb.primary}${kb.subgenre ? ` / ${kb.subgenre}` : ''}`
        : null,
  ].filter(Boolean)

  const peers = Object.entries(board.agentOutputs || {})
    .slice(0, 10)
    .map(([key, raw]) => {
      const data = asRecord(raw)
      const hint =
        data.primaryGenres?.[0] ||
        data.primarySubgenre?.name ||
        data.signatureMatch?.name ||
        data.keySignature ||
        data.psychologicalProfile ||
        data.report ||
        data.activationFormula ||
        data.emotionalJourney ||
        data.summary ||
        data.intention ||
        null
      return hint ? `- peer:${key} → ${String(hint).slice(0, 80)}` : `- peer:${key}`
    })
    .join('\n')

  const waves = board.wavesCompleted.length
    ? `Waves complete: ${board.wavesCompleted.join(' → ')}`
    : null

  return [
    '## Shared Sonic DNA blackboard (authoritative — do not invent contradicting DSP)',
    'Pipeline: waveform → DSP measure → classify lock → polymath ∥ → intention → description',
    facts.length ? `Measured facts: ${facts.join(' · ')}` : 'Measured facts: pending seed',
    waves,
    kb
      ? [
          `Encyclopedia primary: ${kb.primary} / family ${kb.family}`,
          kb.related.length ? `Related traditions (context, not crate tags): ${kb.related.join(', ')}` : null,
          kb.emotions.length ? `Affect cluster: ${kb.emotions.join(', ')}` : null,
          kb.regions.length ? `Regions: ${kb.regions.join(', ')}` : null,
          kb.profileExcerpt,
          kb.scienceNotes[0] ? `Science note: ${kb.scienceNotes[0].slice(0, 280)}` : null,
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    peers ? `Peers already on the board:\n${peers}` : null,
    board.conflicts.length
      ? `Open conflicts (DSP seed wins): ${board.conflicts
          .slice(0, 3)
          .map((c) => c.field)
          .join(', ')}`
      : null,
    QUOTE_THE_GRID_RULE,
    'Bind culture/history/psychology/psychoacoustics to measured usage — never playlist, folder, or title leakage.',
    'Communicate with peer agents via this board: quote their claims when they align with measured facts.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * After DSP / classify waves: lock genre via unified engine and refresh KB for polymath peers.
 */
export function lockGenreAndRefreshKb(board: AgentBlackboard): AgentBlackboard {
  const measured = board.measured
  if (!measured?.bpm || !measured.drumFamily || measured.drumFamily === 'unknown') {
    return board
  }

  try {
    const engine = classifyMeasuredWithGenreEngine(measured as SonicDnaMeasured)
    if (!engine.primary || engine.primary === 'Unclassified') return board

    const prior = measured.genre || {}
    const keepPreferred = prior.source === 'user-preferred' || prior.source === 'hybrid'
    const nextMeasured: Partial<SonicDnaMeasured> = {
      ...measured,
      timingFeel: engine.timingFeel !== 'unknown' ? engine.timingFeel : measured.timingFeel,
      effectiveBpm: engine.effectiveBpm ?? measured.effectiveBpm,
      genre: {
        ...prior,
        family: engine.family,
        audioPrimary: engine.primary,
        audioSubgenre: engine.subgenre,
        confidence: engine.confidence,
        source: keepPreferred ? prior.source || 'hybrid' : 'audio-measured',
        primary: keepPreferred ? prior.primary || engine.primary : engine.primary,
        subgenre: keepPreferred ? prior.subgenre || engine.subgenre : engine.subgenre,
        judgment:
          prior.judgment ||
          (engine.ruleId
            ? `Genre engine ${engine.ruleId}: ${engine.reason.slice(-2).join('; ')}`
            : engine.reason.slice(-2).join('; ')),
      },
    }

    const kb = buildKbSlice({
      primary: nextMeasured.genre?.audioPrimary || nextMeasured.genre?.primary,
      family: nextMeasured.genre?.family || engine.family,
      subgenre: nextMeasured.genre?.audioSubgenre || nextMeasured.genre?.subgenre,
      drumFamily: nextMeasured.drumFamily,
    })

    return {
      ...board,
      measured: nextMeasured,
      kb,
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return board
  }
}

/**
 * Explicit DAG waves for polymath parallel collaboration.
 * Optimum: waveform → technical → DSP measure (∥) → classify lock → polymath (∥) → intention → description.
 * Genre runs AFTER drum/harmony so the board holds groove facts before labeling.
 */
export const AGENT_COLLAB_WAVES: Array<{
  id: string
  agents: BlackboardAgentId[]
  parallel: boolean
  phase?: string
}> = [
  { id: 'waveform', agents: ['waveform_generator'], parallel: false, phase: 'waveform' },
  { id: 'technical', agents: ['technical_analyzer'], parallel: false, phase: 'dsp_measure' },
  {
    id: 'measure-dsp',
    agents: ['drum_pattern_expert', 'harmony_analyst'],
    parallel: true,
    phase: 'dsp_measure',
  },
  {
    id: 'measure-pocket',
    agents: ['bass_pocket_analyst', 'instrument_usage_analyst'],
    parallel: true,
    phase: 'dsp_measure',
  },
  {
    id: 'classify-lock',
    agents: ['genre_specialist'],
    parallel: false,
    phase: 'classify_lock',
  },
  {
    id: 'polymath-specialists',
    agents: [
      'cultural_analyst',
      'musicologist',
      'emotional_psychologist',
      'psychology_analyst',
      'psychoacoustics_analyst',
    ],
    parallel: true,
    phase: 'polymath',
  },
  { id: 'intention', agents: ['intention_analyst'], parallel: false, phase: 'intention' },
  { id: 'description', agents: ['description_writer'], parallel: false, phase: 'description' },
]

/** Infer seed fields from comprehensive + enhanced analysis blobs. */
export function seedMeasuredFromPreanalysis(opts: {
  trackId: string
  trackTitle: string
  artistName: string
  audioFeatures?: { bpm?: number; key?: string; energyLevel?: number }
  comprehensive?: any
  enhanced?: any
}): AgentBlackboard {
  const comprehensive = opts.comprehensive || {}
  const enhanced = opts.enhanced || {}
  const drum =
    enhanced?.drumAnalysis?.signatureMatch?.name ||
    comprehensive?.drums?.signatureMatch?.name ||
    comprehensive?.drums?.pattern?.patternType ||
    null
  const timing =
    enhanced?.timing?.feel ||
    comprehensive?.enhancedTiming?.feel ||
    comprehensive?.technical?.timingFeel ||
    null
  const primary =
    enhanced?.subgenreClassification?.primarySubgenre?.parent ||
    comprehensive?.genres?.primary?.[0] ||
    comprehensive?.genres?.primaryGenres?.[0] ||
    null
  const sub =
    enhanced?.subgenreClassification?.primarySubgenre?.name ||
    comprehensive?.genres?.subgenres?.[0] ||
    null

  return createBlackboard({
    trackId: opts.trackId,
    trackTitle: opts.trackTitle,
    artistName: opts.artistName,
    bpm: opts.audioFeatures?.bpm ?? comprehensive?.technical?.bpm ?? null,
    key: opts.audioFeatures?.key ?? comprehensive?.harmony?.keySignature ?? null,
    timingFeel: timing,
    effectiveBpm: enhanced?.timing?.effectiveBpm ?? comprehensive?.technical?.effectiveBpm ?? null,
    drumFamily: typeof drum === 'string' ? drum : null,
    kickSteps: enhanced?.drumAnalysis?.kick?.positions || comprehensive?.drums?.kickAnalysis?.positions || [],
    snareSteps: enhanced?.drumAnalysis?.snare?.positions || comprehensive?.drums?.snareAnalysis?.positions || [],
    bassLock: enhanced?.drumAnalysis?.bassline?.type || comprehensive?.drums?.bassline?.type || null,
    primaryGenre: primary,
    subgenre: sub,
    genreFamily: enhanced?.subgenreClassification?.primarySubgenre?.parent || primary,
  })
}
