import { describe, expect, it } from 'vitest'
import { toolStepLog, type ToolStepLogInput } from '@/lib/ai/admin-ai-tool-step-groups'

const album = 'https://distrokid.com/dashboard/album/?albumuuid=D908E9D1-1514-4C04-988C051A39FFAE34'
const isrc = 'https://distrokid.com/isrc/?albumuuid=D908E9D1-1514-4C04-988C051A39FFAE34'
const music = 'https://distrokid.com/mymusic/'

function step(partial: Partial<ToolStepLogInput> & Pick<ToolStepLogInput, 'id' | 'summary'>): ToolStepLogInput {
  return {
    tool: 'admin_browser',
    status: 'done',
    payload: {},
    ...partial,
  }
}

const albumBody = [
  `Opened ${album}.`,
  'Upload',
  'My Music',
  'Staying A Vibe',
  'SERGIK',
  'Record Label: SERGIKdropz',
  'Release date: October 8, 2026',
  'DistroKid UPC: 700563968501',
  'billed to card ending with 2039',
].join('\n')

describe('tool step log', () => {
  it('turns an ISRC redirect into a scan trail and keeps the page text for later', () => {
    const readBody = 'Upload\nRefer a Friend\nStats\nSplits\nbilled to card ending with 2039'
    const steps = [
      step({ id: '1', payload: { action: 'navigate', url: isrc }, summary: `Opened ${music}.\n${readBody}` }),
      step({ id: '2', payload: { action: 'read' }, summary: readBody }),
      step({ id: '3', payload: { action: 'navigate', url: album }, summary: albumBody }),
      step({ id: '4', payload: { action: 'wheel' }, summary: 'Scrolled the page.' }),
      step({ id: '5', payload: { action: 'wheel' }, summary: 'Scrolled the page.' }),
      step({ id: '6', payload: { action: 'read' }, summary: albumBody }),
    ]
    const before = steps[0].summary
    const log = toolStepLog(steps)
    expect(steps[0].summary).toBe(before)
    expect(log.outcome).toBe('Explored DistroKid · ISRC page redirected to My Music')
    expect(log.bursts.map((burst) => `${burst.kind}: ${burst.label}`)).toEqual([
      'blocked: Tried the ISRC page · landed on My Music',
      'read: Read My Music',
      'explored: Opened the album page · Staying A Vibe · UPC 700563968501 · October 8, 2026',
      'scrolled: Scrolled the album page 2×',
      'read: Read the album page · Staying A Vibe · UPC 700563968501 · October 8, 2026',
    ])
    expect(log.bursts[1]?.label).not.toMatch(/2039|Upload|Refer a Friend/)
    expect(log.bursts[0]?.raw).toContain('Opened https://distrokid.com/mymusic/')
  })

  it('keeps the album title when the read leads with parsed DistroKid codes', () => {
    const summary = [
      'DISTROKID CODES',
      'Album: Staying A Vibe',
      'UPC: 700563968501',
      '1. Pre Party — QZES72569811',
      'Parsed from album HTML (.isrc-value), including desktop-only cells hidden from visible text.',
      'Staying A Vibe',
      'Release date: October 8, 2026',
    ].join('\n')
    const log = toolStepLog([
      step({ id: '1', payload: { action: 'navigate', url: album }, summary: `Opened ${album}.` }),
      step({ id: '2', payload: { action: 'read' }, summary }),
    ])
    expect(log.bursts[1]?.label).toContain('Staying A Vibe')
    expect(log.bursts[1]?.label).toContain('UPC 700563968501')
    expect(log.bursts[1]?.label).not.toMatch(/DISTROKID CODES|Pre Party/)
  })

  it('does not merge the same page when another action happens between the reads', () => {
    const log = toolStepLog([
      step({ id: '1', payload: { action: 'navigate', url: music }, summary: `Opened ${music}.` }),
      step({ id: '2', payload: { action: 'read' }, summary: 'Upload\nMy Music' }),
      step({ id: '3', payload: { action: 'wheel' }, summary: 'Scrolled the page.' }),
      step({ id: '4', payload: { action: 'read' }, summary: 'Upload\nMy Music' }),
    ])
    expect(log.bursts.map((burst) => burst.kind)).toEqual(['explored', 'read', 'scrolled', 'read'])
  })

  it('marks an admin login open as blocked', () => {
    const log = toolStepLog([
      step({
        id: '1',
        payload: { action: 'navigate', url: 'https://sergikdropz.com/admin/login' },
        summary: 'Opened https://sergikdropz.com/admin/login. Admin Login Sign In',
      }),
    ])
    expect(log.bursts[0]).toMatchObject({ kind: 'blocked', tone: 'blocked', label: 'Stopped on Admin Login' })
    expect(log.outcome).toBe('Blocked · stopped on Admin Login')
  })

  it('stages a preview in one line and leaves the diff out of the log', () => {
    const log = toolStepLog([
      step({
        id: '1',
        tool: 'patch_release_marketing_copy',
        payload: { dryRun: true },
        summary: 'Would update upc on "Staying A Vibe".',
      }),
    ])
    expect(log.bursts[0]).toMatchObject({
      kind: 'ran',
      label: 'Staged a preview to update upc on "Staying A Vibe".',
    })
    expect(log.outcome).toBe('Staged a preview to update upc on "Staying A Vibe".')
  })

  it('names an audit and a studio check from the stored sentence', () => {
    const log = toolStepLog([
      step({
        id: '1',
        tool: 'audit_music_contract',
        summary: 'Shares do not total 100% on the split sheet.',
      }),
      step({
        id: '2',
        tool: 'query_release_studio_snapshot',
        summary: 'Loaded release "Staying A Vibe" with 5 track(s). 2 marketing field(s) empty.',
      }),
    ])
    expect(log.bursts.map((burst) => burst.kind)).toEqual(['audited', 'checked'])
    expect(log.bursts[0]?.label).toMatch(/split sheet/)
    expect(log.bursts[1]?.label).toMatch(/Staying A Vibe/)
  })

  it('keeps a running burst on its own line', () => {
    const log = toolStepLog([
      step({ id: '1', payload: { action: 'wheel' }, summary: 'Scrolled the page.' }),
      step({ id: '2', payload: { action: 'wheel' }, status: 'running', summary: 'Running admin_browser…' }),
    ])
    expect(log.bursts).toHaveLength(2)
    expect(log.bursts[1]?.running).toBe(true)
    expect(log.live).toMatch(/in progress/)
  })
})
