/** Status lines while an admin reply is still streaming. Display order is random and biased to the live turn. */

type WorkingCue = 'page' | 'desk' | 'thread' | 'codes' | 'release' | 'compose' | 'signal' | 'time'

const CUE_ORDER: readonly WorkingCue[] = [
  'page',
  'desk',
  'thread',
  'codes',
  'release',
  'compose',
  'signal',
  'time',
]

const CUE_PATTERNS: ReadonlyArray<readonly [WorkingCue, RegExp]> = [
  ['page', /\b(pages?|browser|scroll\w*|navigat\w*|opened|dashboard|website|https?:)\b/i],
  ['desk', /\b(desks?|distrokid|soundexchange|workspace)\b/i],
  ['thread', /\b(threads?|replies|reply|messages?|chats?)\b/i],
  ['codes', /\b(upc|isrc|barcode|ean|metadata)\b/i],
  ['release', /\b(releases?|albums?|catalog|tracks?)\b/i],
  ['compose', /\b(draft\w*|lyrics?|captions?|campaigns?|composing|briefs?|writing|strategy pack)\b/i],
  ['signal', /\b(sonic|bpm|waveform|mixdown|mastering|audio)\b/i],
  ['time', /\b(deadlines?|schedul\w*|calendars?|delivers|release date)\b/i],
]

const TAGGED_WORKING_LINES: ReadonlyArray<{ line: string; cues: readonly WorkingCue[] }> = [
  { line: 'Pondering', cues: [] },
  { line: 'Tuning the room', cues: ['desk', 'signal'] },
  { line: 'Synthesizing', cues: [] },
  { line: 'Reading the open desk', cues: ['desk', 'page'] },
  { line: 'Contemplating', cues: [] },
  { line: 'Following the thread', cues: ['thread'] },
  { line: 'Formulating', cues: ['compose'] },
  { line: 'Listening for the next bar', cues: ['signal', 'time'] },
  { line: 'Deliberating', cues: [] },
  { line: 'Tracing the signal', cues: ['signal', 'codes'] },
  { line: 'Distilling', cues: [] },
  { line: 'Lining up the facts', cues: ['codes', 'release'] },
  { line: 'Hypothesizing', cues: [] },
  { line: 'Walking the page', cues: ['page'] },
  { line: 'Calibrating', cues: [] },
  { line: 'Pulling the live picture', cues: ['page'] },
  { line: 'Observing', cues: [] },
  { line: 'Sorting what still matters', cues: ['thread', 'release'] },
  { line: 'Inferring', cues: [] },
  { line: 'Holding the groove', cues: ['signal'] },
  { line: 'Articulating', cues: ['compose'] },
  { line: 'Scanning the desk', cues: ['desk', 'page'] },
  { line: 'Interpreting', cues: [] },
  { line: 'Working the problem', cues: ['codes', 'release', 'thread'] },
  { line: 'Reflecting', cues: [] },
  { line: 'Exploring the page', cues: ['page'] },
  { line: 'Composing', cues: ['compose'] },
  { line: 'Analyzing the turn', cues: ['thread'] },
  { line: 'Weighing evidence', cues: ['codes'] },
  { line: 'Operating on this chat', cues: ['thread'] },
  { line: 'Resolving phase', cues: [] },
  { line: 'Digging through the thread', cues: ['thread'] },
  { line: 'Measuring the field', cues: [] },
  { line: 'Mapping the next step', cues: ['release', 'time'] },
  { line: 'Isolating a variable', cues: [] },
  { line: 'Cross-checking the codes', cues: ['codes'] },
  { line: 'Modeling the signal', cues: ['signal'] },
  { line: 'Warming the answer', cues: ['compose'] },
  { line: 'Tracing causality', cues: [] },
  { line: 'Looking under the hood', cues: ['page', 'desk'] },
  { line: 'Deriving the relation', cues: [] },
  { line: 'Riding the live page', cues: ['page'] },
  { line: 'Sampling the spectrum', cues: ['signal'] },
  { line: 'Piecing the picture together', cues: ['release', 'codes'] },
  { line: 'Computing the tension', cues: [] },
  { line: 'Checking the release', cues: ['release'] },
  { line: 'Testing an assumption', cues: [] },
  { line: 'Catching the downbeat', cues: ['signal', 'time'] },
  { line: 'Scoring the phrase', cues: ['compose'] },
  { line: 'Running the sequence', cues: ['time', 'release'] },
  { line: 'Voicing the partials', cues: ['compose', 'signal'] },
  { line: 'Sifting the page', cues: ['page'] },
  { line: 'Notating the finding', cues: ['compose'] },
  { line: 'Keeping time', cues: ['time', 'signal'] },
  { line: 'Arranging the motif', cues: ['compose', 'signal'] },
  { line: 'Opening the next door', cues: ['release', 'time'] },
  { line: 'Sketching the form', cues: ['compose'] },
  { line: 'Tracking the change', cues: ['release', 'time'] },
  { line: 'Attuning the ear', cues: ['signal'] },
  { line: 'Gathering the live read', cues: ['page'] },
  { line: 'Illuminating a pattern', cues: [] },
  { line: 'Shaping the cadence', cues: ['compose', 'signal'] },
  { line: 'Rendering the timbre', cues: ['compose', 'signal'] },
  { line: 'Connecting partials', cues: [] },
  { line: 'Clarifying intent', cues: [] },
  { line: 'Considering the shape', cues: ['compose'] },
]

/** Chance a matching turn stays inside the fitting lines. The rest draws from the whole deck. */
const CONTEXT_BIAS = 0.68

export const ADMIN_AI_WORKING_LINES = TAGGED_WORKING_LINES.map((entry) => entry.line)

export const ADMIN_AI_WORKING_GENERIC_NOTE = 'In progress: Assistant is working on this chat.'

export function workingLineAt(index: number): string {
  const lines = ADMIN_AI_WORKING_LINES
  const safe = ((index % lines.length) + lines.length) % lines.length
  return lines[safe] ?? lines[0]
}

export function isGenericWorkingNote(note: string | null | undefined): boolean {
  const text = note?.trim() ?? ''
  return !text || text === ADMIN_AI_WORKING_GENERIC_NOTE
}

export function workingCuesFor(text: string | null | undefined): WorkingCue[] {
  const cleaned = (text ?? '').replace(ADMIN_AI_WORKING_GENERIC_NOTE, ' ')
  return CUE_ORDER.filter((cue) => CUE_PATTERNS.some(([name, pattern]) => name === cue && pattern.test(cleaned)))
}

export function workingCueKey(note?: string | null, context?: string | null): string {
  return workingCuesFor(workingContextText(note, context)).join('|')
}

function workingContextText(note?: string | null, context?: string | null): string {
  const live = isGenericWorkingNote(note) ? '' : (note ?? '')
  return [live, context ?? ''].filter((part) => part.trim()).join('\n')
}

function linesForCues(cues: readonly WorkingCue[]): string[] {
  if (!cues.length) return []
  return TAGGED_WORKING_LINES.filter((entry) => entry.cues.some((cue) => cues.includes(cue))).map(
    (entry) => entry.line,
  )
}

export function pickWorkingLine(input: {
  previous?: string | null
  note?: string | null
  context?: string | null
  random?: () => number
}): string {
  const random = input.random ?? Math.random
  const specific = linesForCues(workingCuesFor(workingContextText(input.note, input.context)))
  const source =
    specific.length > 0 && random() < CONTEXT_BIAS ? specific : ADMIN_AI_WORKING_LINES
  const withoutPrevious = source.filter((line) => line !== input.previous)
  const deck =
    withoutPrevious.length > 0
      ? withoutPrevious
      : ADMIN_AI_WORKING_LINES.filter((line) => line !== input.previous)
  const pool = deck.length > 0 ? deck : ADMIN_AI_WORKING_LINES
  return pool[Math.floor(random() * pool.length)] ?? pool[0]!
}
