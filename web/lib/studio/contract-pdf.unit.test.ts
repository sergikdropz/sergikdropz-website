import { describe, expect, it } from 'vitest'
import { parseMailMessage } from '@/lib/email/promo-assets'
import {
  buildContractPdf,
  contractBodyForSending,
  contractComposeBody,
  contractInboundDeskBody,
  contractKindFromSubject,
  contractOutboundDeskBody,
  contractPdfFilename,
  contractPdfHref,
  contractReleaseIdFromDraft,
  releaseTitleFromContractSubject,
} from '@/lib/studio/contract-pdf'

const RELEASE = '11111111-1111-4111-8111-111111111111'

describe('contract pdf', () => {
  it('names the file from the packet and release', () => {
    expect(contractPdfFilename('Split sheet', 'Are We Awake?')).toBe('split-sheet-are-we-awake.pdf')
    expect(contractPdfHref(RELEASE, 'split_sheet')).toBe(
      `/api/studio/releases/${RELEASE}/contracts/pdf?kind=split_sheet`,
    )
    expect(contractPdfHref('release-1790754809917-mv0itq40', 'producer_agreement')).toBe(
      '/api/studio/releases/release-1790754809917-mv0itq40/contracts/pdf?kind=producer_agreement',
    )
    expect(contractPdfHref('../secret', 'split_sheet')).toBeNull()
  })

  it('reads a signing subject back into kind and title', () => {
    const subject = 'Re: Split sheet for signing — Are We Awake?'
    expect(contractKindFromSubject(subject)).toBe('split_sheet')
    expect(releaseTitleFromContractSubject(subject)).toBe('Are We Awake?')
    expect(contractKindFromSubject('Hello')).toBeNull()
  })

  it('builds a PDF that contains the contract title', () => {
    const pdf = buildContractPdf({
      title: 'Split sheet',
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      body: 'Ownership:\n  - SERGIK (Jordan Caboga): 50%\n'.repeat(80),
    })
    const text = pdf.toString('ascii')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('(Split sheet) Tj')
    expect(text).toContain('SERGIK \\(Jordan Caboga\\)')
    expect(text).toContain('2 / ')
    expect(text).toContain('%%EOF')
  })

  it('files studio links into department-mail copy', () => {
    const outbound = contractOutboundDeskBody({
      packetLabel: 'Split sheet',
      releaseTitle: 'Are We Awake?',
      recipients: ['Breauxx <breauxx@example.com>'],
      packetText: 'Parties agree.',
      studioUrl: 'https://sergikdropz.com/studio/releases/11111111-1111-4111-8111-111111111111?step=rights',
    })
    const parsed = parseMailMessage(outbound)
    expect(parsed.prose).toContain('Parties agree.')
    expect(parsed.blocks[0]).toMatchObject({ kind: 'link', label: 'Open contract in Studio' })

    const inbound = contractInboundDeskBody({
      fromName: 'Breauxx',
      fromEmail: 'breauxx@example.com',
      replyText: 'I agree',
      studioUrl: 'https://sergikdropz.com/studio/releases/11111111-1111-4111-8111-111111111111?step=rights',
    })
    expect(parseMailMessage(inbound).prose).toContain('I agree')
  })

  it('holds the PDF and DocuSign in a draft, then strips the studio note on send', () => {
    const studioUrl = `https://sergikdropz.com/studio/releases/${RELEASE}?step=rights`
    const draft = contractComposeBody({
      packetLabel: 'Collab agreement',
      releaseTitle: 'Walk That Walk',
      albumArtist: 'SERGIK',
      partyNames: 'Breauxx',
      pdfFilename: 'collab-agreement-walk-that-walk.pdf',
      packetText: 'Term: 5 years',
      studioUrl,
    })
    expect(draft).toContain('Review this draft in Department Mail')
    expect(draft).toContain('Download the attached PDF (collab-agreement-walk-that-walk.pdf)')
    expect(draft).toContain('DocuSign is included')
    expect(draft).toContain('Term: 5 years')
    expect(contractReleaseIdFromDraft(draft)).toBe(RELEASE)
    const outbound = contractBodyForSending(draft)
    expect(outbound).not.toContain('Review this draft')
    expect(outbound).not.toContain('/studio/releases/')
    expect(outbound).toContain('Hi Breauxx')
    expect(outbound).toContain('Term: 5 years')
  })
})
