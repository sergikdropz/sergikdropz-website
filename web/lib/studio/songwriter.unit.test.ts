import { describe, expect, it } from 'vitest'
import {
  parseWriterLegalNames,
  seedWriterLegalRows,
  serializeWriterLegalNames,
  songwriterParties,
  writerLegalNameIssues,
} from '@/lib/studio/songwriter'

describe('songwriter legal names', () => {
  it('maps SERGIK to Jordan Caboga and lists billed collabs', () => {
    const contributors = [
      { role: 'primary', name: 'SERGIK' },
      { role: 'primary', name: 'OG Coconut' },
    ]
    expect(songwriterParties(contributors)).toEqual(['SERGIK', 'OG Coconut'])
    const rows = seedWriterLegalRows(contributors, 'Jordan Caboga')
    expect(rows).toEqual([
      { stage: 'SERGIK', legal: 'Jordan Caboga' },
      { stage: 'OG Coconut', legal: '' },
    ])
  })

  it('round-trips staged JSON names', () => {
    const rows = [
      { stage: 'SERGIK', legal: 'Jordan Caboga' },
      { stage: 'OG Coconut', legal: 'Casey Coconut' },
    ]
    const raw = serializeWriterLegalNames(rows)
    expect(parseWriterLegalNames(raw)).toEqual(rows)
  })

  it('flags a missing collaborator legal name', () => {
    const issues = writerLegalNameIssues(
      'Jordan Caboga',
      ['SERGIK'],
      [
        { role: 'primary', name: 'SERGIK' },
        { role: 'primary', name: 'OG Coconut' },
      ],
    )
    expect(issues.join(' ')).toMatch(/OG Coconut/)
    expect(writerLegalNameIssues('Jordan Caboga')).toEqual([])
    expect(writerLegalNameIssues('SERGIK')[0]).toMatch(/stage name/i)
  })

  it('includes featured and vocalist parties for legal names', () => {
    expect(
      songwriterParties([
        { role: 'primary', name: 'SERGIK' },
        { role: 'featured', name: 'Mira' },
        { role: 'vocalist', name: 'BeJanis' },
      ]),
    ).toEqual(['SERGIK', 'Mira', 'BeJanis'])
  })
})
