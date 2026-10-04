import { describe, expect, it } from 'vitest'
import {
  buildMissionBlockerFixQuickStart,
  pickSmartDefaultExpandedSection,
} from '@/lib/admin-ai-dock-ui'

describe('admin-ai-dock-ui', () => {
  it('picks unfinished then blockers then explore', () => {
    expect(
      pickSmartDefaultExpandedSection({
        hasRelease: true,
        unfinishedCount: 2,
        priorityCount: 4,
        blockerCount: 5,
      }),
    ).toBe('unfinished')
    expect(
      pickSmartDefaultExpandedSection({
        hasRelease: true,
        unfinishedCount: 0,
        priorityCount: 4,
        blockerCount: 3,
      }),
    ).toBe('priority')
    expect(
      pickSmartDefaultExpandedSection({
        hasRelease: false,
        unfinishedCount: 0,
        priorityCount: 0,
        blockerCount: 0,
      }),
    ).toBe('creative')
  })

  it('builds ISRC fix quick start with rights nav', () => {
    const start = buildMissionBlockerFixQuickStart('rel-1', {
      nextAction: 'Assign missing ISRC codes',
      nextActionKind: 'assign_isrc',
      blockers: ['Missing ISRC on track 1'],
    })
    expect(start?.nav?.step).toBe('rights')
    expect(start?.message).toMatch(/assign_isrcs/)
    expect(start?.priorityScore).toBe(10)
  })
})
