import { describe, expect, it } from 'vitest'
import {
  hydratePasteText,
  hydrateSourceLabel,
  isAdminBrowserHydrateDetail,
} from '@/lib/ai/admin-browser-hydrate'
import { buildDistroKidBrowserHydrate } from '@/lib/ai/distrokid-browser-hydrate'
import { DISTROKID_MY_MUSIC_URL, DISTROKID_NEW_RELEASE_URL } from '@/lib/studio/distrokid-delivery'
import { buildMissionDock } from '@/lib/admin-ai-mission-dock'

describe('distrokid-browser-hydrate', () => {
  it('builds upload hydrate with worksheet paste-on-demand', () => {
    const detail = buildDistroKidBrowserHydrate({
      releaseId: 'release-dk',
      releaseTitle: 'Staying A Vibe',
      worksheet: 'Artist: SERGIK\nTitle: Staying A Vibe',
      uploadBy: '2026-09-04',
      streetDate: '2026-10-02',
      windowLabel: 'Due for DistroKid upload',
      blockers: ['Missing ISRC on track 2'],
    })
    expect(detail.kind).toBe('distrokid')
    expect(detail.deskLabel).toBe('DistroKid')
    expect(detail.target).toBe('upload')
    expect(detail.url).toBe(DISTROKID_NEW_RELEASE_URL)
    expect(detail.worksheet).toContain('Staying A Vibe')
    expect(detail.pasteOnDemand).toBe(true)
    expect(hydratePasteText(detail)).toContain('SERGIK')
    expect(hydrateSourceLabel(detail)).toBe('DistroKid schedule')
    expect(isAdminBrowserHydrateDetail(detail)).toBe(true)
  })

  it('targets My Music URL when requested', () => {
    const detail = buildDistroKidBrowserHydrate({
      releaseId: 'release-dk',
      target: 'my_music',
      worksheet: 'x',
      myMusicUrl: DISTROKID_MY_MUSIC_URL,
    })
    expect(detail.url).toBe(DISTROKID_MY_MUSIC_URL)
  })
})

describe('mission dock DistroKid delivery actions', () => {
  it('exposes DistroKid fill + My Music desk actions on delivery step', () => {
    const dock = buildMissionDock({
      surface: 'studio',
      pathname: '/studio/releases/abc',
      studio: { releaseId: 'abc', title: 'Staying A Vibe', activeStep: 'delivery' },
    })
    const labels = dock.menus.flatMap((m) => m.items.map((i) => i.label))
    expect(labels).toContain('Fill DistroKid desk')
    expect(labels).toContain('Open My Music desk')
    expect(labels).toContain('After upload stamp')
    const fill = dock.menus.flatMap((m) => m.items).find((i) => i.id === 'dk-fill')
    expect(fill?.action).toEqual({ type: 'distrokid-hydrate', target: 'upload' })
  })
})
