import { describe, expect, it } from 'vitest'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog-types'
import {
  filesRespectingPlacementTechnique,
  hideClaimedPlacementTechniques,
  joinMockupTaskKeys,
  mockupFileGroups,
  mockupStyleOptionsForFiles,
  printFilesForSelectedTechniques,
  splitMockupTaskKeys,
} from '@/lib/merch/technique-mix'

function file(type: string, title: string): CatalogPrintFile {
  return { fileId: type, type, title, additionalPrice: null, options: [] }
}

const tee: CatalogPrintFile[] = [
  file('front', 'Front print'),
  file('back', 'Back print'),
  file('embroidery_chest_left', 'Left chest'),
  file('front_dtf', 'Front print'),
]

describe('technique mix', () => {
  it('shows DTG and embroidery placements when both techniques are on', () => {
    const shown = printFilesForSelectedTechniques(tee, ['DTG', 'EMBROIDERY']).map((row) => row.type)
    expect(shown).toEqual(['front', 'back', 'embroidery_chest_left'])
  })

  it('hides front DTG once left-chest embroidery has art, and keeps the back', () => {
    const union = printFilesForSelectedTechniques(tee, ['DTG', 'EMBROIDERY'])
    expect(hideClaimedPlacementTechniques(union, ['embroidery_chest_left']).map((row) => row.type)).toEqual([
      'back',
      'embroidery_chest_left',
    ])
  })

  it('hides left-chest embroidery once the front print has art', () => {
    const union = printFilesForSelectedTechniques(tee, ['DTG', 'EMBROIDERY'])
    expect(hideClaimedPlacementTechniques(union, ['front']).map((row) => row.type)).toEqual(['front', 'back'])
  })

  it('hides placements Printful will not combine, even when they use the same technique', () => {
    const conflicts = [
      { placement: 'front', conflicts: ['front_large'] },
      { placement: 'front_large', conflicts: ['front'] },
      { placement: 'sleeve_left', conflicts: ['sleeve_right'] },
      { placement: 'sleeve_right', conflicts: ['sleeve_left'] },
      { placement: 'embroidery_chest_left', conflicts: ['embroidery_chest_center'] },
      { placement: 'embroidery_chest_center', conflicts: ['embroidery_chest_left'] },
    ]
    const prints = printFilesForSelectedTechniques(
      [file('front', 'Front print'), file('front_large', 'Large front print'), file('back', 'Back print')],
      ['DTG'],
    )
    expect(hideClaimedPlacementTechniques(prints, ['front'], conflicts).map((row) => row.type)).toEqual(['front', 'back'])
    const sleeves = [file('back', 'Back print'), file('sleeve_left', 'Left sleeve'), file('sleeve_right', 'Right sleeve')]
    expect(hideClaimedPlacementTechniques(sleeves, ['sleeve_left'], conflicts).map((row) => row.type)).toEqual([
      'back',
      'sleeve_left',
    ])
    const chests = printFilesForSelectedTechniques(
      [
        file('back', 'Back print'),
        file('embroidery_chest_left', 'Left chest'),
        file('embroidery_chest_center', 'Center chest'),
      ],
      ['DTG', 'EMBROIDERY'],
    )
    expect(hideClaimedPlacementTechniques(chests, ['embroidery_chest_left'], conflicts).map((row) => row.type)).toEqual([
      'back',
      'embroidery_chest_left',
    ])
  })

  it('sends the front print and the back, and drops the wide front Printful rejects', () => {
    const sent = filesRespectingPlacementTechnique(
      [{ type: 'front' }, { type: 'front_large' }, { type: 'back' }],
      'front',
      [
        { placement: 'front', conflicts: ['front_large'] },
        { placement: 'front_large', conflicts: ['front'] },
      ],
    ).map((row) => row.type)
    expect(sent).toEqual(['front', 'back'])
  })

  it('photographs each technique on its own view', () => {
    const techniques = [
      { key: 'DTG', isDefault: true },
      { key: 'EMBROIDERY' },
    ]
    const groups = mockupFileGroups(
      [
        { type: 'embroidery_chest_left', title: 'Left chest' },
        { type: 'back', title: 'Back print' },
      ],
      techniques,
    )
    expect(groups.map((group) => [group.technique, group.files.map((file) => file.type)])).toEqual([
      ['EMBROIDERY', ['embroidery_chest_left']],
      ['DTG', ['back']],
    ])
    expect(
      mockupStyleOptionsForFiles(groups[0].files, { optionGroups: ['Flat'], options: ['Front', 'Back'] }),
    ).toEqual({ optionGroups: ['Flat'], options: ['Front'] })
    expect(
      mockupStyleOptionsForFiles(groups[1].files, { optionGroups: ['Flat'], options: ['Front', 'Back'] }),
    ).toEqual({ optionGroups: ['Flat'], options: ['Back'] })
    expect(joinMockupTaskKeys(['gt-1', 'gt-2'])).toBe('gt-1,gt-2')
    expect(splitMockupTaskKeys('gt-1,gt-2')).toEqual(['gt-1', 'gt-2'])
  })

  it('sends left-chest embroidery and a DTG back, and drops a second technique on the front', () => {
    const sent = filesRespectingPlacementTechnique(
      [
        { type: 'front' },
        { type: 'embroidery_chest_left' },
        { type: 'back' },
      ],
      'embroidery_chest_left',
    ).map((row) => row.type)
    expect(sent).toEqual(['embroidery_chest_left', 'back'])
  })
})
