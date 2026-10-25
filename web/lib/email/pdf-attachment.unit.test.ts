import { describe, expect, it } from 'vitest'
import { buildTextPdf, extractPdfText } from '@/lib/email/pdf-attachment'
import { buildContractPdf } from '@/lib/studio/contract-pdf'

describe('pdf attachment edit', () => {
  it('reads the words out of a contract PDF', () => {
    const pdf = buildContractPdf({
      title: 'Collaboration agreement',
      releaseTitle: 'Walk That Walk',
      albumArtist: 'SERGIK x Breauxx',
      body: 'Term: 5 years.',
    })
    const text = extractPdfText(pdf)
    expect(text).toContain('Collaboration agreement')
    expect(text).toContain('Walk That Walk')
    expect(text).toContain('Term: 5 years.')
    expect(text).not.toContain('SERGIK Studio paperwork')
  })

  it('writes an edited PDF that round-trips the new wording', () => {
    const edited = 'SERGIK COLLABORATION AGREEMENT\nTerm: 3 years.'
    const again = extractPdfText(buildTextPdf(edited))
    expect(again).toContain('Term: 3 years.')
    expect(again.startsWith('SERGIK COLLABORATION AGREEMENT')).toBe(true)
  })
})
