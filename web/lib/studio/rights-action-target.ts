import { WORKFLOW_STEPS, type WorkflowStepId } from '@/lib/studio/constants'
import { workflowStepForActionKind } from '@/lib/studio/studio-ia'

export type RightsActionSection =
  | 'writer_legal'
  | 'credits'
  | 'splits'
  | 'title'
  | 'ai'
  | 'cover'
  | 'attestations'
  | 'contracts'
  | 'pro'
  | 'publisher'
  | 'genre'
  | 'street_date'
  | 'previously_released'
  | 'upc'
  | 'artwork'
  | 'artist_profiles'
  | 'wav'
  | 'isrc'

export type RightsActionFocus = {
  step: WorkflowStepId
  section: RightsActionSection
  trackId?: string
  party?: string
}

function issuePrefix(issueId: string): string {
  const idx = issueId.indexOf(':')
  return idx >= 0 ? issueId.slice(0, idx) : issueId
}

export function parseIssueTrackId(issueId: string | null | undefined): string | undefined {
  const raw = String(issueId || '')
  const idx = raw.indexOf(':')
  if (idx < 0) return undefined
  const rest = raw.slice(idx + 1).trim()
  return rest || undefined
}

/** Pull collaborator stage name from writer-legal blocker copy. */
export function partyFromWriterLegalLabel(label: string): string | undefined {
  const forMatch = label.match(/legal name for (.+?) \(/i)
  if (forMatch?.[1]?.trim()) return forMatch[1].trim()
  const quoted = label.match(/^[“"](.+?)[”"]/)
  if (quoted?.[1]?.trim()) return quoted[1].trim()
  return undefined
}

export function resolveIngestIssueTarget(issue: {
  id: string
  label: string
}): RightsActionFocus {
  const id = String(issue.id || '')
  const trackId = parseIssueTrackId(id)
  const prefix = issuePrefix(id)

  switch (prefix) {
    case 'writer':
      return {
        step: 'catalog',
        section: 'writer_legal',
        trackId,
        party: partyFromWriterLegalLabel(issue.label),
      }
    case 'apple':
      return { step: 'catalog', section: 'credits', trackId }
    case 'ai':
      return { step: 'catalog', section: 'ai', trackId }
    case 'splits':
      return { step: 'catalog', section: 'splits', trackId }
    case 'title':
      return { step: 'catalog', section: 'title', trackId }
    case 'cover':
    case 'mechanical':
      return { step: 'rights', section: 'cover', trackId }
    case 'radio':
    case 'radio-isrc':
    case 'preview':
    case 'preview-clip':
      return { step: 'catalog', section: 'credits', trackId }
    case 'switch-overlap':
    case 'switch-takedown':
      return { step: 'metadata', section: 'previously_released' }
    case 'genre':
      return { step: 'metadata', section: 'genre' }
    case 'date':
    case 'date-lead':
      return { step: 'metadata', section: 'street_date' }
    case 'previous':
    case 'previous-ids':
    case 'previous-isrc':
      return { step: 'metadata', section: 'previously_released' }
    case 'switch-upc':
      return { step: 'metadata', section: 'upc' }
    case 'switch-isrc':
      return { step: 'rights', section: 'isrc' }
    case 'switch-masters':
      return { step: 'catalog', section: 'wav', trackId }
    case 'attestations':
    case 'artwork-owned':
      return { step: 'rights', section: 'attestations' }
    case 'artwork-policy':
      return { step: 'metadata', section: 'artwork' }
    case 'youtube-artist':
    case 'instagram-artist':
    case 'facebook-artist':
      return { step: 'delivery', section: 'artist_profiles' }
    case 'tracks':
      return { step: 'catalog', section: 'credits' }
    default:
      return { step: 'rights', section: 'attestations' }
  }
}

export function resolveCopyrightActionTarget(action: {
  kind: string
  label: string
  field?: string | null
  issue_id?: string | null
}): RightsActionFocus {
  if (action.kind === 'assign_tracks') {
    return { step: 'catalog', section: 'credits' }
  }
  if (action.kind === 'upload_audio') {
    return { step: 'catalog', section: 'wav' }
  }
  if (action.kind === 'assign_isrc') {
    return { step: 'rights', section: 'isrc' }
  }
  if (action.kind === 'fix_splits') {
    return { step: 'catalog', section: 'splits' }
  }
  if (action.kind === 'set_upc') {
    return { step: 'metadata', section: 'upc' }
  }
  if (
    action.kind === 'register_composition' ||
    action.kind === 'register_master' ||
    action.kind === 'register_pro'
  ) {
    return { step: 'rights', section: 'pro' }
  }
  if (action.kind === 'complete_legal_lock' && !action.field) {
    return { step: 'rights', section: 'contracts' }
  }
  if (action.kind === 'complete_rights_intake' || action.field === 'rights_intake_complete') {
    return { step: 'rights', section: 'attestations' }
  }
  if (action.kind === 'complete_dsp_ingest' || action.issue_id) {
    return resolveIngestIssueTarget({
      id: action.issue_id || '',
      label: action.label,
    })
  }
  if (action.kind === 'ready') {
    return { step: 'launch', section: 'attestations' }
  }
  return {
    step: workflowStepForActionKind(action.kind),
    section: 'attestations',
  }
}

const SECTION_LABELS: Record<RightsActionSection, string> = {
  writer_legal: 'Writer legal names',
  credits: 'Credits',
  splits: 'Splits',
  title: 'Title',
  ai: 'AI declaration',
  cover: 'Cover packet',
  attestations: 'Attestations',
  contracts: 'Contracts',
  pro: 'PRO registration',
  publisher: 'Publisher',
  genre: 'Genre',
  street_date: 'Street date',
  previously_released: 'Previously released',
  upc: 'UPC',
  artwork: 'Artwork',
  artist_profiles: 'Artist profiles',
  wav: 'WAV masters',
  isrc: 'ISRCs',
}

const PIPELINE_BLOCKER_PHRASES: Array<{ test: RegExp; focus: RightsActionFocus }> = [
  { test: /at least one track/i, focus: { step: 'catalog', section: 'credits' } },
  { test: /wav file/i, focus: { step: 'catalog', section: 'wav' } },
  { test: /assign isrc/i, focus: { step: 'rights', section: 'isrc' } },
  { test: /splits must total 100/i, focus: { step: 'catalog', section: 'splits' } },
  { test: /rights intake/i, focus: { step: 'rights', section: 'attestations' } },
  { test: /legal lock/i, focus: { step: 'rights', section: 'contracts' } },
  { test: /contract status/i, focus: { step: 'rights', section: 'contracts' } },
  { test: /composition copyright/i, focus: { step: 'rights', section: 'pro' } },
  { test: /master copyright/i, focus: { step: 'rights', section: 'pro' } },
  { test: /pro registration/i, focus: { step: 'rights', section: 'pro' } },
  { test: /\bupc\b/i, focus: { step: 'metadata', section: 'upc' } },
]

/** Map a mission-control blocker sentence onto the Studio step and field it is about. */
export function studioTargetForBlocker(
  label: string,
  issues: Array<{ id?: string | null; label?: string | null }> = [],
): RightsActionFocus {
  const text = label.trim()
  const issue = issues.find((item) => String(item.label || '').trim() === text && String(item.id || '').trim())
  if (issue?.id) {
    return resolveIngestIssueTarget({ id: String(issue.id), label: text })
  }

  for (const phrase of PIPELINE_BLOCKER_PHRASES) {
    if (phrase.test.test(text)) return phrase.focus
  }

  if (/legal name/i.test(text)) {
    return {
      step: 'catalog',
      section: 'writer_legal',
      party: partyFromWriterLegalLabel(text),
    }
  }
  if (/split/i.test(text)) return { step: 'catalog', section: 'splits' }
  if (/genre/i.test(text)) return { step: 'metadata', section: 'genre' }
  if (/previously released/i.test(text)) return { step: 'metadata', section: 'previously_released' }
  if (/street date|release date/i.test(text)) return { step: 'metadata', section: 'street_date' }
  if (/artwork/i.test(text)) return { step: 'metadata', section: 'artwork' }
  if (/attestation/i.test(text)) return { step: 'rights', section: 'attestations' }
  if (/youtube|instagram|facebook/i.test(text)) return { step: 'delivery', section: 'artist_profiles' }
  if (/cover|mechanical/i.test(text)) return { step: 'rights', section: 'cover' }
  if (/\bai\b|artificial/i.test(text)) return { step: 'catalog', section: 'ai' }
  if (/apple music|producer credit|performer/i.test(text)) return { step: 'catalog', section: 'credits' }
  if (/\bwav\b|master/i.test(text)) return { step: 'catalog', section: 'wav' }
  if (/isrc/i.test(text)) return { step: 'rights', section: 'isrc' }

  return { step: 'rights', section: 'attestations' }
}

export function studioTargetLabel(focus: Pick<RightsActionFocus, 'step' | 'section'>): string {
  const step = WORKFLOW_STEPS.find((row) => row.id === focus.step)?.label || focus.step
  const section = SECTION_LABELS[focus.section] || focus.section
  return `${step} · ${section}`
}
