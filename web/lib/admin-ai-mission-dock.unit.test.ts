import { describe, expect, it } from 'vitest'
import { buildMissionDock } from '@/lib/admin-ai-mission-dock'

describe('buildMissionDock', () => {
  it('uses the open Rights step instead of generic copy and launch actions', () => {
    const dock = buildMissionDock({
      surface: 'studio',
      pathname: '/studio/releases/rel-1',
      studio: {
        releaseId: 'rel-1',
        title: 'Smoke Break',
        activeStep: 'rights',
        nextAction: 'Assign missing ISRC codes',
      },
    })
    expect(dock.areaLabel).toBe('Rights')
    expect(dock.subject).toBe('Smoke Break')
    const labels = dock.menus.flatMap((menu) => menu.items.map((item) => item.label))
    expect(labels).toContain('Fix top blocker')
    expect(labels).toContain('Split sheet')
    expect(labels).not.toContain('Draft copy')
    expect(labels).not.toContain('Week priorities')
    expect(dock.menus.map((menu) => menu.label)).toEqual(['Rights', 'Paperwork', 'Clearance'])
  })

  it('follows Music Vault from the admin path', () => {
    const dock = buildMissionDock({
      surface: 'admin',
      pathname: '/admin/music-vault',
    })
    expect(dock.areaLabel).toBe('Music Vault')
    expect(dock.menus.some((menu) => menu.items.some((item) => item.label === 'Vault hygiene'))).toBe(true)
  })

  it('uses pipeline ops when Studio is open without a release', () => {
    const dock = buildMissionDock({
      surface: 'studio',
      pathname: '/studio/pipeline',
    })
    expect(dock.areaLabel).toBe('Pipeline')
    expect(dock.menus[0]?.label).toBe('Pipeline')
  })
})
