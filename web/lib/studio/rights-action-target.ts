import type { WorkflowStepId } from '@/lib/studio/constants'
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
      return { step: 'catalog', section: 'credits', trackId }
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
