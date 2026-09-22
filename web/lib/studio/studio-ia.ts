import { WORKFLOW_STEPS, type WorkflowStepId } from './constants'

export const STUDIO_PATHS = {
  home: '/studio',
  releases: '/studio/releases',
  create: '/studio/create',
  pipeline: '/studio/pipeline',
  collab: '/studio/collab',
} as const

export const STUDIO_CREATE_TABS = ['release', 'track', 'import'] as const
export type StudioCreateTab = (typeof STUDIO_CREATE_TABS)[number]

export const STUDIO_PIPELINE_TABS = ['ops', 'marketing', 'calendar', 'isrcs'] as const
export type StudioPipelineTab = (typeof STUDIO_PIPELINE_TABS)[number]

export type StudioNavId = 'home' | 'releases' | 'create' | 'pipeline' | 'collab'

export function studioCollabHref(releaseId?: string | null): string {
  if (!releaseId) return STUDIO_PATHS.collab
  return `${STUDIO_PATHS.collab}?release=${encodeURIComponent(releaseId)}`
}

export function parseStudioCreateTab(value: string | null | undefined): StudioCreateTab {
  if (value === 'track' || value === 'import') return value
  return 'release'
}

export function parseStudioPipelineTab(value: string | null | undefined): StudioPipelineTab {
  if (value === 'marketing' || value === 'calendar' || value === 'isrcs') return value
  return 'ops'
}

export function studioCreateHref(tab: StudioCreateTab = 'release'): string {
  return tab === 'release' ? STUDIO_PATHS.create : `${STUDIO_PATHS.create}?tab=${tab}`
}

export function studioPipelineHref(tab: StudioPipelineTab = 'ops'): string {
  return tab === 'ops' ? STUDIO_PATHS.pipeline : `${STUDIO_PATHS.pipeline}?tab=${tab}`
}

const WORKFLOW_STEP_IDS = new Set<string>(WORKFLOW_STEPS.map((step) => step.id))

export function parseStudioWorkflowStep(value: string | null | undefined): WorkflowStepId | null {
  if (value && WORKFLOW_STEP_IDS.has(value)) return value as WorkflowStepId
  return null
}

export function studioReleaseHref(releaseId: string, step?: WorkflowStepId | null): string {
  const base = `${STUDIO_PATHS.releases}/${encodeURIComponent(releaseId)}`
  return step ? `${base}?step=${step}` : base
}

export function studioReleasePublicHref(releaseId: string): string {
  return `/music/${encodeURIComponent(releaseId)}`
}

/** Map copyright next-action kinds onto the matching workspace step. */
export function workflowStepForActionKind(kind: string | null | undefined): WorkflowStepId {
  switch (kind) {
    case 'assign_tracks':
    case 'upload_audio':
      return 'catalog'
    case 'assign_isrc':
    case 'fix_splits':
      return 'rights'
    case 'set_upc':
      return 'metadata'
    case 'complete_rights_intake':
    case 'complete_legal_lock':
    case 'register_composition':
    case 'register_master':
    case 'register_pro':
    case 'enable_monitoring':
      return 'rights'
    case 'complete_dsp_ingest':
      return 'rights'
    case 'ready':
      return 'launch'
    default:
      return 'catalog'
  }
}

const CREATE_LEGACY = new Set([
  '/studio/releases/new',
  '/studio/tracks/new',
  '/studio/catalog/import',
])

const PIPELINE_LEGACY = new Set([
  '/studio/releases/pipeline',
  '/studio/releases/command-center',
  '/studio/releases/calendar',
  '/studio/soundexchange',
])

const RELEASE_DETAIL_EXCLUDED = new Set(['new', 'pipeline', 'calendar', 'command-center'])

export function isStudioNavActive(item: StudioNavId, pathname: string | null): boolean {
  if (!pathname) return false
  if (item === 'home') return pathname === STUDIO_PATHS.home
  if (item === 'collab') {
    return pathname === STUDIO_PATHS.collab || pathname.startsWith(`${STUDIO_PATHS.collab}/`)
  }
  if (item === 'create') {
    return pathname === STUDIO_PATHS.create || pathname.startsWith(`${STUDIO_PATHS.create}/`) || CREATE_LEGACY.has(pathname)
  }
  if (item === 'pipeline') {
    return (
      pathname === STUDIO_PATHS.pipeline ||
      pathname.startsWith(`${STUDIO_PATHS.pipeline}/`) ||
      PIPELINE_LEGACY.has(pathname)
    )
  }
  if (item !== 'releases') return false
  if (pathname === STUDIO_PATHS.releases) return true
  const match = pathname.match(/^\/studio\/releases\/([^/]+)$/)
  return Boolean(match && !RELEASE_DETAIL_EXCLUDED.has(match[1]))
}
