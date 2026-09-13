/**
 * Canonical Sonic DNA intelligence pipeline architecture.
 *
 * Optimum order (accuracy first, then polymath depth):
 *   1. Health          — file/envelope integrity
 *   2. Waveform        — peaks / pocket envelope (shared signal)
 *   3. DSP measure     — BPM, drums, bass pocket, key (facts; no LLM genre yet)
 *   4. Normalize       — agent/local → `measured` schema + genre engine
 *   5. Classify lock   — audioPrimary from DSP + trained overlays; KB slice
 *   6. Blend           — optional catalog preference (hybrid judgment)
 *   7. Polymath LLMs   — culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics
 *   8. Intention       — serial synthesis of peer claims
 *   9. Description     — serial unified narrative quoting the grid
 *  10. Compose         — encyclopedia sections / report layers
 *  11. Challenge       — accuracy audit + deterministic patches (+ admin guidance)
 *  12. Publish         — persist to infrastructure
 *
 * Hard rule: LLMs never invent BPM/drums/key that contradict measured.
 * Title/folder/playlist are crates, not genre labels, after groove core exists.
 * LLM polymath/intention/description skip when groove core is missing.
 */

export const SONIC_DNA_ARCHITECTURE_VERSION = 'sonic-dna-intel-v3' as const

export const SONIC_DNA_INTEL_PHASES = [
  'health',
  'waveform',
  'dsp_measure',
  'normalize',
  'classify_lock',
  'blend',
  'polymath',
  'intention',
  'description',
  'compose',
  'challenge',
  'publish',
] as const

export type SonicDnaIntelPhase = (typeof SONIC_DNA_INTEL_PHASES)[number]

export type SonicDnaIntelPhaseMeta = {
  id: SonicDnaIntelPhase
  order: number
  label: string
  kind: 'signal' | 'dsp' | 'classify' | 'llm' | 'compose' | 'gate'
  parallel: boolean
  requiresGrooveCore: boolean
  summary: string
}

export const SONIC_DNA_INTEL_PHASE_META: SonicDnaIntelPhaseMeta[] = [
  {
    id: 'health',
    order: 1,
    label: 'Audio health',
    kind: 'signal',
    parallel: false,
    requiresGrooveCore: false,
    summary: 'Verify file/envelope integrity before spending DSP or LLM budget.',
  },
  {
    id: 'waveform',
    order: 2,
    label: 'Waveform envelope',
    kind: 'signal',
    parallel: false,
    requiresGrooveCore: false,
    summary: 'Build shared peaks/envelope — the Father signal for pocket + agents.',
  },
  {
    id: 'dsp_measure',
    order: 3,
    label: 'DSP measure',
    kind: 'dsp',
    parallel: true,
    requiresGrooveCore: false,
    summary: 'Parallel drum + harmony; then bass pocket lock. No genre LLM yet.',
  },
  {
    id: 'normalize',
    order: 4,
    label: 'Normalize measured',
    kind: 'dsp',
    parallel: false,
    requiresGrooveCore: false,
    summary: 'Map agent/local facts into measured schema gates.',
  },
  {
    id: 'classify_lock',
    order: 5,
    label: 'Classify + lock genre',
    kind: 'classify',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Unified genre engine (DSP + overlays) locks audioPrimary; refresh KB slice.',
  },
  {
    id: 'blend',
    order: 6,
    label: 'Blend preference',
    kind: 'classify',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Optional catalog preference → hybrid judgment; keep audioPrimary.',
  },
  {
    id: 'polymath',
    order: 7,
    label: 'Polymath specialists',
    kind: 'llm',
    parallel: true,
    requiresGrooveCore: true,
    summary: 'Culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics on one blackboard.',
  },
  {
    id: 'intention',
    order: 8,
    label: 'Intention',
    kind: 'llm',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Serial: weave peer claims into why the groove moves the floor.',
  },
  {
    id: 'description',
    order: 9,
    label: 'Description',
    kind: 'llm',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Serial: unified narrative that quotes measured BPM/drums/key.',
  },
  {
    id: 'compose',
    order: 10,
    label: 'Compose encyclopedia',
    kind: 'compose',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Fill report sections from measured + KB + agent outputs.',
  },
  {
    id: 'challenge',
    order: 11,
    label: 'Accuracy challenge',
    kind: 'gate',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Audit claims vs measured; resolve genre conflicts; ground unquoted sections; stamp bass.',
  },
  {
    id: 'publish',
    order: 12,
    label: 'Publish',
    kind: 'gate',
    parallel: false,
    requiresGrooveCore: true,
    summary: 'Persist best DNA into DB/cache infrastructure.',
  },
]

/** Human-readable optimum sequence for docs / UI / challenge gates. */
export function describeSonicDnaOptimumSequence(): string {
  return [
    'Optimum Sonic DNA sequence (accuracy → polymath depth):',
    '',
    '1. Health — file/envelope integrity',
    '2. Waveform — shared peaks/envelope',
    '3. DSP measure — BPM, drums, bass pocket, key (drum ∥ harmony → bass)',
    '4. Normalize — measured schema + local DSP merge',
    '5. Classify lock — genre engine overlays → audioPrimary + KB slice',
    '6. Blend — optional catalog preference (hybrid)',
    '7. Polymath LLMs — culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics (parallel, board-bound)',
    '8. Intention — serial peer synthesis',
    '9. Description — serial grid-quoting narrative',
    '10. Compose — encyclopedia / report layers',
    '11. Accuracy challenge — audit + patch vs measured (+ admin notes)',
    '12. Publish — infrastructure write',
    '',
    'Never: title/folder genre before groove core. Never: LLM invents DSP. Skip LLM waves without groove core.',
  ].join('\n')
}

export function intelPhaseById(id: SonicDnaIntelPhase): SonicDnaIntelPhaseMeta | undefined {
  return SONIC_DNA_INTEL_PHASE_META.find((phase) => phase.id === id)
}
