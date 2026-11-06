import { describe, expect, it } from 'vitest'
import { printFilesForSelectedTechniques } from '@/lib/merch/technique-mix'
import { buildDesignTabs, placementFileToOpen } from '@/lib/merch/design-tabs'

describe('buildDesignTabs', () => {
  it('shows one Front tab when Printful lists front and front_dtf for the same view', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'front', title: 'Front print', additionalPrice: null },
        { type: 'front_dtf', title: 'Front', additionalPrice: null },
        { type: 'back', title: 'Back print', additionalPrice: null },
      ],
      [],
    )
    const frontTabs = tabs.filter((tab) => tab.label === 'Front' || tab.label.toLowerCase().includes('front'))
    expect(frontTabs).toHaveLength(1)
    expect(frontTabs[0]?.id).toBe('front')
  })

  it('names the large hat front "Front Wide" and places it beside Front', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'addon_embroidery_front', title: 'Front', additionalPrice: 2.95 },
        { type: 'embroidery_front_large', title: 'Front', additionalPrice: null },
        { type: 'embroidery_back', title: 'Back', additionalPrice: null },
        { type: 'embroidery_right', title: 'Right side', additionalPrice: null },
        { type: 'embroidery_left', title: 'Left side', additionalPrice: null },
      ],
      [],
    )
    expect(tabs.map((tab) => tab.label)).toEqual(['Front', 'Front Wide', 'Back', 'Right side', 'Left side'])
  })

  it('keeps Front large as a separate tab', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'front', title: 'Front print', additionalPrice: null },
        { type: 'front_large', title: 'Front large print', additionalPrice: 5 },
      ],
      [],
    )
    expect(tabs.map((tab) => tab.id)).toEqual(['front', 'front_large'])
    expect(tabs.map((tab) => tab.label)).toEqual(['Front', 'Front Wide'])
  })

  it('does not duplicate sleeve sides already on the primary bar', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'sleeve_right', title: 'Right side', additionalPrice: null },
        { type: 'sleeve_right_dtf', title: 'Right side', additionalPrice: null },
        { type: 'sleeve_left', title: 'Left side', additionalPrice: null },
      ],
      [],
    )
    expect(tabs.filter((t) => t.label.toLowerCase().includes('right'))).toHaveLength(1)
    expect(tabs.filter((t) => t.label.toLowerCase().includes('left'))).toHaveLength(1)
  })

  const snapback = [
    { type: 'embroidery_front', title: 'Front', additionalPrice: null },
    { type: 'embroidery_front_large', title: 'Front', additionalPrice: null },
    { type: 'embroidery_back', title: 'Back', additionalPrice: null },
    { type: 'embroidery_right', title: 'Right side', additionalPrice: null },
    { type: 'embroidery_left', title: 'Left side', additionalPrice: null },
    { type: 'addon_embroidery_front', title: 'Front', additionalPrice: null },
  ]

  it('puts saved front art on the Front tab when the default front file is empty', () => {
    const tabs = buildDesignTabs(snapback, [], { preferTypes: ['addon_embroidery_front'] })
    expect(tabs.map((tab) => tab.label)).toEqual(['Front', 'Front Wide', 'Back', 'Right side', 'Left side'])
    expect(tabs.find((tab) => tab.label === 'Front')?.id).toBe('addon_embroidery_front')
    expect(tabs.find((tab) => tab.label === 'Front Wide')?.id).toBe('embroidery_front_large')
  })

  it('keeps Front Wide as its own tab when that file holds the art', () => {
    const tabs = buildDesignTabs(snapback, [], { preferTypes: ['embroidery_front_large'] })
    expect(tabs.find((tab) => tab.label === 'Front')?.id).toBe('embroidery_front')
    expect(tabs.find((tab) => tab.label === 'Front Wide')?.id).toBe('embroidery_front_large')
  })

  it('keeps left-chest embroidery and front DTG as separate tabs until one is chosen', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'front', title: 'Front print', additionalPrice: null },
        { type: 'back', title: 'Back print', additionalPrice: null },
        { type: 'embroidery_chest_left', title: 'Left chest', additionalPrice: null },
      ],
      [],
      { separateTechniques: true },
    )
    expect(tabs.map((tab) => tab.id)).toEqual(['front', 'embroidery_chest_left', 'back'])
    expect(tabs.map((tab) => tab.label)).toEqual(['Front', 'Left chest', 'Back'])
  })

  it('names both front techniques when print and embroidery share that side', () => {
    const tabs = buildDesignTabs(
      [
        { type: 'front', title: 'Front print', additionalPrice: null },
        { type: 'embroidery_front', title: 'Front', additionalPrice: null },
        { type: 'back', title: 'Back print', additionalPrice: null },
      ],
      [],
      { separateTechniques: true },
    )
    expect(tabs.map((tab) => tab.label)).toEqual(['Front · DTG', 'Front · embroidery', 'Back'])
  })

  it('bella 3001 shows left chest beside the front print, and keeps the wide front', () => {
    const rows = [
      ['embroidery_chest_left', 'Left chest'],
      ['embroidery_chest_center', 'Center chest'],
      ['embroidery_sleeve_left_top', 'Left sleeve top'],
      ['embroidery_sleeve_right_top', 'Right sleeve top'],
      ['front', 'Front print'],
      ['front_dtf', 'Front print'],
      ['front_large', 'Large front print'],
      ['back', 'Back print'],
      ['back_dtf', 'Back print'],
      ['sleeve_left', 'Left sleeve'],
      ['sleeve_right', 'Right sleeve'],
      ['label_inside', 'Inside label'],
      ['label_outside', 'Outside label'],
    ].map(([type, title]) => ({
      fileId: type,
      type,
      title,
      additionalPrice: null,
      options: [],
    }))
    const shown = printFilesForSelectedTechniques(rows, ['DTG', 'EMBROIDERY'])
    const tabs = buildDesignTabs(shown, [], { separateTechniques: true })
    expect(tabs.map((tab) => `${tab.id}:${tab.label}`)).toEqual([
      'front:Front',
      'front_large:Front Wide',
      'embroidery_chest_left:Left chest',
      'back:Back',
      'sleeve_right:Right sleeve',
      'embroidery_sleeve_right_top:Right sleeve top',
      'sleeve_left:Left sleeve',
      'embroidery_sleeve_left_top:Left sleeve top',
      'label_inside:Inside label',
      'label_outside:Outside label',
    ])
  })

  it('reopens the remembered tab, otherwise the first tab that has art', () => {
    const tabs = buildDesignTabs(snapback, [], { preferTypes: ['addon_embroidery_front', 'embroidery_back'] })
    const layers = {
      addon_embroidery_front: { assetUrl: '/front.png' },
      embroidery_back: { assetUrl: '/back.png' },
    }
    expect(placementFileToOpen(tabs, layers, 'embroidery_back')).toBe('embroidery_back')
    expect(placementFileToOpen(tabs, layers, null)).toBe('addon_embroidery_front')
    expect(placementFileToOpen(tabs, { embroidery_front_large: { assetUrl: '/wide.png' } }, 'embroidery_front')).toBe(
      'embroidery_front_large',
    )
    expect(placementFileToOpen(tabs, layers, 'embroidery_right')).toBe('addon_embroidery_front')
  })
})
