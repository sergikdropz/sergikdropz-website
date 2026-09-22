import { describe, expect, it } from 'vitest'
import {
  isStudioNavActive,
  parseStudioCreateTab,
  parseStudioPipelineTab,
  parseStudioWorkflowStep,
  studioCollabHref,
  studioCreateHref,
  studioPipelineHref,
  studioReleaseHref,
  studioReleasePublicHref,
  workflowStepForActionKind,
} from '@/lib/studio/studio-ia'

describe('studio IA', () => {
  it('defaults unknown create/pipeline tabs', () => {
    expect(parseStudioCreateTab(undefined)).toBe('release')
    expect(parseStudioCreateTab('track')).toBe('track')
    expect(parseStudioCreateTab('nope')).toBe('release')
    expect(parseStudioPipelineTab(null)).toBe('ops')
    expect(parseStudioPipelineTab('calendar')).toBe('calendar')
    expect(parseStudioPipelineTab('command')).toBe('ops')
  })

  it('builds shareable hub hrefs', () => {
    expect(studioCreateHref()).toBe('/studio/create')
    expect(studioCreateHref('import')).toBe('/studio/create?tab=import')
    expect(studioPipelineHref()).toBe('/studio/pipeline')
    expect(studioPipelineHref('isrcs')).toBe('/studio/pipeline?tab=isrcs')
    expect(studioCollabHref()).toBe('/studio/collab')
    expect(studioCollabHref('abc')).toBe('/studio/collab?release=abc')
  })

  it('builds release workspace hrefs with optional step', () => {
    expect(studioReleaseHref('abc')).toBe('/studio/releases/abc')
    expect(studioReleaseHref('a b')).toBe('/studio/releases/a%20b')
    expect(studioReleaseHref('abc', 'rights')).toBe('/studio/releases/abc?step=rights')
    expect(studioReleasePublicHref('abc')).toBe('/music/abc')
    expect(parseStudioWorkflowStep('copy')).toBe('copy')
    expect(parseStudioWorkflowStep('nope')).toBeNull()
    expect(workflowStepForActionKind('assign_tracks')).toBe('catalog')
    expect(workflowStepForActionKind('assign_isrc')).toBe('rights')
    expect(workflowStepForActionKind('fix_splits')).toBe('rights')
    expect(workflowStepForActionKind('set_upc')).toBe('metadata')
    expect(workflowStepForActionKind('complete_legal_lock')).toBe('rights')
    expect(workflowStepForActionKind('complete_dsp_ingest')).toBe('rights')
    expect(workflowStepForActionKind('ready')).toBe('launch')
  })

  it('marks the five nav destinations without overlapping hubs', () => {
    expect(isStudioNavActive('home', '/studio')).toBe(true)
    expect(isStudioNavActive('home', '/studio/releases')).toBe(false)
    expect(isStudioNavActive('releases', '/studio/releases')).toBe(true)
    expect(isStudioNavActive('releases', '/studio/releases/abc')).toBe(true)
    expect(isStudioNavActive('releases', '/studio/releases/new')).toBe(false)
    expect(isStudioNavActive('releases', '/studio/create')).toBe(false)
    expect(isStudioNavActive('create', '/studio/create')).toBe(true)
    expect(isStudioNavActive('create', '/studio/tracks/new')).toBe(true)
    expect(isStudioNavActive('pipeline', '/studio/pipeline')).toBe(true)
    expect(isStudioNavActive('pipeline', '/studio/soundexchange')).toBe(true)
    expect(isStudioNavActive('pipeline', '/studio/releases')).toBe(false)
    expect(isStudioNavActive('collab', '/studio/collab')).toBe(true)
    expect(isStudioNavActive('collab', '/studio/releases')).toBe(false)
    expect(isStudioNavActive('releases', '/studio/collab')).toBe(false)
  })
})
