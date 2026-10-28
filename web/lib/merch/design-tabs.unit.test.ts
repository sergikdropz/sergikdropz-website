import { describe, expect, it } from 'vitest'
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
  })
})
