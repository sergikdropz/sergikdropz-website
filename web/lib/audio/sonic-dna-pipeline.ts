import {
  extractMeasured,
  hasDspMeasuredGroove,
  hasMeasuredBpm,
  hasMeasuredDrums,
  hasMeasuredKey,
  parseSonicDna,
  sonicDnaStatusFromMeasured,
  type SonicDnaMeasured,
} from '@/lib/audio/sonic-dna-quality'
import { normalizeAgentDnaToMeasured } from '@/lib/audio/normalize-agent-to-measured'

/** Ordered stages for an accurate Sonic DNA knowledge card (admin UI). */
export const SONIC_DNA_PIPELINE_STAGES = [
  'await_audio',
  'measure',
  'classify',
  'blend',
  'fill',
  'challenge',
  'publish',
] as const

export type SonicDnaPipelineStageId = (typeof SONIC_DNA_PIPELINE_STAGES)[number]

export type SonicDnaPipelineNextAction =
  | 'run_audio'
  | 'classify_genre'
  | 'blend_preference'
  | 'fill_encyclopedia'
  | 'run_challenge'
  | 'save'
  | 'none'

export type SonicDnaPipelineAssessment = {
  stage: SonicDnaPipelineStageId
  nextAction: SonicDnaPipelineNextAction
  /** Human label for the current stage. */
  label: string
  /** What the admin should do next. */
  instruction: string
  blockers: string[]
  hasAnyDsp: boolean
  /** BPM + drums present — enough to judge genre/usage claims. */
  hasGrooveCore: boolean
  /** BPM + drums + key (or unpitched). */
  hasFullDsp: boolean
  preferenceOnly: boolean
  canFillEncyclopedia: boolean
  canRunAccuracyChallenge: boolean
  canPublish: boolean
  measured: SonicDnaMeasured | null
  stages: Array<{ id: SonicDnaPipelineStageId; label: string; done: boolean; current: boolean }>
}

const STAGE_LABELS: Record<SonicDnaPipelineStageId, string> = {
  await_audio: '1 · Waveform / await audio',
  measure: '2 · Measure groove (DSP)',
  classify: '3 · Classify lock (genre engine)',
  blend: '4 · Blend preference',
  fill: '5 · Polymath + encyclopedia',
  challenge: '6 · Accuracy challenge',
  publish: '7 · Publish-ready',
}

export function hasGrooveCore(measured?: SonicDnaMeasured | null): boolean {
  return hasMeasuredBpm(measured) && hasMeasuredDrums(measured)
}

export function hasFullDspGroove(measured?: SonicDnaMeasured | null): boolean {
  return hasGrooveCore(measured) && hasMeasuredKey(measured)
}

export function isPreferenceOnlyGenre(measured?: SonicDnaMeasured | null): boolean {
  const source = String(measured?.genre?.source || '').toLowerCase()
  const hasAudioClass = Boolean(String(measured?.genre?.audioPrimary || '').trim())
  if (source === 'user-preferred' && !hasAudioClass) return true
  if (!hasDspMeasuredGroove(measured) && Boolean(measured?.genre?.primary)) return true
  return false
}

/**
 * Assess where a track sits in the Sonic DNA accuracy pipeline.
 * Order is intentional: waveform → DSP measure → classify → blend → polymath fill → challenge → publish.
 */
export function assessSonicDnaPipeline(dna: unknown): SonicDnaPipelineAssessment {
  const root = parseSonicDna(dna) || (dna && typeof dna === 'object' ? (dna as Record<string, any>) : null)
  // Agent DNA often lacks `measured` — normalize technical/drums into groove gates.
  let measured = extractMeasured(root)
  if (!hasGrooveCore(measured) && root) {
    measured = normalizeAgentDnaToMeasured(root) || measured
  }
  const hasAnyDsp = hasDspMeasuredGroove(measured)
  const grooveCore = hasGrooveCore(measured)
  const fullDsp = hasFullDspGroove(measured)
  const preferenceOnly = isPreferenceOnlyGenre(measured)
  const status = sonicDnaStatusFromMeasured(measured)
  const hasAudioClass = Boolean(String(measured?.genre?.audioPrimary || '').trim())
  const hasIntel = Boolean(
    measured?.intelligence?.description ||
      measured?.report?.description ||
      measured?.report?.layers?.dsp ||
      measured?.report?.layers?.historical,
  )
  const blockers: string[] = []

  if (!hasAnyDsp) {
    blockers.push('No audio-measured BPM, drums, or key. Re-run Sonic DNA from audio before trusting genre copy.')
  } else if (!grooveCore) {
    if (!hasMeasuredBpm(measured)) blockers.push('BPM is missing or low-confidence.')
    if (!hasMeasuredDrums(measured)) blockers.push('Drum family / kick-snare grid is missing.')
  } else if (!fullDsp) {
    blockers.push('Key/root is missing — optional for genre, required for publish-ready.')
  }
  if (preferenceOnly) {
    blockers.push('Genre source is catalog preference only — blend after audio measure.')
  }

  let stage: SonicDnaPipelineStageId = 'await_audio'
  let nextAction: SonicDnaPipelineNextAction = 'run_audio'
  let instruction = 'Re-run audio Sonic DNA so BPM, drums, and key lock from the file — not the catalog label.'

  if (!hasAnyDsp) {
    stage = 'await_audio'
    nextAction = 'run_audio'
    instruction =
      'Pipeline blocked: no DSP groove. Accuracy Challenge and encyclopedia fill must wait until audio analysis returns BPM/drums/key.'
  } else if (!grooveCore) {
    stage = 'measure'
    nextAction = 'run_audio'
    instruction = 'Partial DSP only. Re-run or fix measurement until BPM and drum grid are both present.'
  } else if (!hasAudioClass) {
    stage = 'classify'
    nextAction = 'classify_genre'
    instruction =
      'Groove core is measured. Run genre-engine classify lock (or Re-run audio) so audioPrimary is set before polymath fill.'
  } else if (preferenceOnly || (measured?.genre?.source === 'user-preferred' && measured?.genre?.audioPrimary)) {
    stage = 'blend'
    nextAction = measured?.genre?.source === 'hybrid' ? 'fill_encyclopedia' : 'blend_preference'
    instruction =
      measured?.genre?.source === 'hybrid'
        ? 'Hybrid genre is set. Fill encyclopedia sections from measured groove + preference judgment.'
        : 'Blend catalog preference with the audio-measured groove class, then fill encyclopedia.'
  } else if (!hasIntel || status === 'partial') {
    stage = 'fill'
    nextAction = 'fill_encyclopedia'
    instruction =
      'Core groove + audio class locked. Run polymath fill (culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics) then Accuracy Challenge.'
  } else if (!fullDsp) {
    stage = 'challenge'
    nextAction = 'run_challenge'
    instruction = 'Encyclopedia present. Run Accuracy Challenge against the measured groove; consider re-running audio for key if needed.'
  } else {
    stage = 'publish'
    nextAction = 'save'
    instruction = 'DSP complete and knowledge card filled. Save / publish when Accuracy Challenge is clean.'
  }

  // If we have full DSP + intel, challenge is available even at publish stage
  const canFillEncyclopedia = grooveCore && hasAudioClass
  const canRunAccuracyChallenge = grooveCore
  const canPublish = fullDsp && hasIntel && !preferenceOnly && hasAudioClass

  if (canRunAccuracyChallenge && stage === 'fill' && hasIntel) {
    stage = 'challenge'
    nextAction = 'run_challenge'
    instruction = 'Knowledge card is filled. Run Accuracy Challenge to verify claims against the drum grid.'
  }
  if (canPublish && stage === 'challenge') {
    // keep challenge as current until admin confirms; publish is "done" marker
  }

  const stageOrder = SONIC_DNA_PIPELINE_STAGES
  const currentIndex = stageOrder.indexOf(stage)
  const stages = stageOrder.map((id, index) => ({
    id,
    label: STAGE_LABELS[id],
    done: index < currentIndex || (id === 'publish' && canPublish && stage === 'publish'),
    current: id === stage,
  }))

  return {
    stage,
    nextAction,
    label: STAGE_LABELS[stage],
    instruction,
    blockers,
    hasAnyDsp,
    hasGrooveCore: grooveCore,
    hasFullDsp: fullDsp,
    preferenceOnly,
    canFillEncyclopedia,
    canRunAccuracyChallenge,
    canPublish,
    measured,
    stages,
  }
}

/** Markdown used when Accuracy Challenge is blocked before DSP exists (no LLM). */
export function buildAwaitAudioChallengeAnswer(assessment: SonicDnaPipelineAssessment): {
  answer: string
  warnings: string[]
  patches: []
  nextAction: 'run_audio'
  pipeline: SonicDnaPipelineAssessment
} {
  const m = assessment.measured
  const lines = [
    '## Accuracy Challenge — pipeline gate',
    '',
    'This report has **no usable audio-measured groove**. Accuracy Challenge is blocked until Stage 2 (Measure) completes.',
    '',
    '### What the snapshot actually contains',
    '',
    `- BPM: ${m?.bpm ?? 'null'}`,
    `- Timing feel: ${m?.timingFeel ?? 'null'}`,
    `- Drum family: ${m?.drumFamily ?? 'null'}`,
    `- Key: ${m?.key ?? 'null'}`,
    `- Bass: ${m?.bass ? JSON.stringify(m.bass) : 'null'}`,
    `- Percussion: ${m?.percussion ? JSON.stringify(m.percussion) : 'null'}`,
    `- Genre source: \`${m?.genre?.source || 'unknown'}\``,
    `- Audio primary / subgenre: ${m?.genre?.audioPrimary ?? 'null'} / ${m?.genre?.audioSubgenre ?? 'null'}`,
    '',
    '### Required sequence',
    '',
    '1. **Waveform** — shared peaks/envelope',
    '2. **DSP measure** — BPM, drum family, kick/snare/hats, bass lock, key (drums ∥ harmony)',
    '3. **Classify lock** — genre engine audioPrimary + encyclopedia KB slice',
    '4. **Blend preference** — hybrid judgment from catalog + audio (do not discard either)',
    '5. **Polymath fill** — culture ∥ musicology ∥ emotion ∥ psychology ∥ psychoacoustics, then intention → description',
    '6. **Accuracy Challenge** — verify claims against the drum grid',
    '7. **Save / publish**',
    '',
    '### Next action',
    '',
    'Click **Re-run audio**. Do not regenerate encyclopedia or challenge copy until DSP returns.',
  ]

  return {
    answer: lines.join('\n'),
    warnings: assessment.blockers,
    patches: [],
    nextAction: 'run_audio',
    pipeline: assessment,
  }
}

/** Strip preference-invented encyclopedia when DSP is missing — keep preference stamp only. */
export function stripUnsupportedEncyclopedia(dna: unknown): Record<string, any> {
  const root = parseSonicDna(dna) || {}
  const next = JSON.parse(JSON.stringify(root && typeof root === 'object' ? root : {})) as Record<string, any>
  if (!next.measured || typeof next.measured !== 'object') next.measured = {}
  // Prefer normalized groove (agent/technical → measured) before deciding to wipe copy.
  const measured =
    normalizeAgentDnaToMeasured(next) || (next.measured as SonicDnaMeasured & Record<string, any>)
  if (measured) next.measured = { ...next.measured, ...measured }
  if (hasGrooveCore(extractMeasured(next))) return next

  const awaiting =
    'Awaiting audio analysis. Encyclopedia sections stay empty until BPM and drum grid are measured from the file.'

  next.description = awaiting
  next.intention = awaiting
  next.listeningBenefits = awaiting
  if (!next.measured.intelligence || typeof next.measured.intelligence !== 'object') {
    next.measured.intelligence = {}
  }
  next.measured.intelligence.description = awaiting
  next.measured.intelligence.intention = awaiting
  next.measured.intelligence.listeningBenefits = awaiting
  next.measured.intelligence.relatedTraditionsText = awaiting
  next.measured.intelligence.usageText = awaiting
  if (!next.measured.report || typeof next.measured.report !== 'object') next.measured.report = {}
  if (!next.measured.report.layers || typeof next.measured.report.layers !== 'object') {
    next.measured.report.layers = {}
  }
  for (const key of [
    'dsp',
    'historical',
    'cultural',
    'psychological',
    'psychoacoustics',
    'musicological',
    'benefits',
  ]) {
    next.measured.report.layers[key] = awaiting
  }
  next.measured.report.description = awaiting
  next.historical = { ...(next.historical || {}), historicalContext: awaiting }
  next.cultural = { ...(next.cultural || {}), description: awaiting }
  next.emotional = { ...(next.emotional || {}), psychologicalProfile: awaiting }
  next.musicology = { ...(next.musicology || {}), description: awaiting }
  next._pipeline = {
    stage: 'await_audio',
    gatedAt: new Date().toISOString(),
    reason: 'encyclopedia_blocked_until_dsp',
  }
  return next
}

const AWAITING_ENCYCLOPEDIA =
  'Awaiting audio analysis. Encyclopedia sections stay empty until BPM and drum grid are measured from the file.'

/** True when encyclopedia sections can be shown (BPM + drum family measured, not placeholder-only). */
export function isSonicDnaReadyForDisplay(dna: unknown): boolean {
  const root = parseSonicDna(dna)
  if (!root) return false
  if (root._pipeline?.stage === 'await_audio') return false
  const description = String(root.description || '')
  if (description.includes(AWAITING_ENCYCLOPEDIA)) return false

  let measured = extractMeasured(root)
  if (!hasGrooveCore(measured)) {
    measured = normalizeAgentDnaToMeasured(root) || measured
  }
  return hasGrooveCore(measured)
}
