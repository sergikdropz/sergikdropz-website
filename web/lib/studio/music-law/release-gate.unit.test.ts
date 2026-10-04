import { describe, expect, it } from 'vitest'
import { buildProducerAgreementPacket } from '@/lib/studio/rights-packets'
import { splitsBalanceOk, separateSplitCopyrights } from '@/lib/studio/import-parse'
import { applySergikStandardTerms } from '@/lib/studio/music-law/standard-terms'
import { counselGateForPacket } from '@/lib/studio/music-law/release-gate'
import { auditMusicCounsel } from '@/lib/studio/music-law/audit'

describe('counsel desk follow-through', () => {
  it('keeps a legacy 100% sheet valid and requires both tables once separated', () => {
    expect(splitsBalanceOk([{ name: 'SERGIK', percentage: 100, role: 'performer' }])).toBe(true)
    const sided = separateSplitCopyrights([{ name: 'SERGIK', percentage: 100, role: 'performer', legal_name: 'Jordan Caboga' }])
    expect(sided.filter((row) => row.copyright === 'master')).toHaveLength(1)
    expect(sided.filter((row) => row.copyright === 'composition')).toHaveLength(1)
    expect(splitsBalanceOk(sided)).toBe(true)
    expect(
      splitsBalanceOk([
        { name: 'SERGIK', percentage: 100, copyright: 'master' },
        { name: 'SERGIK', percentage: 80, copyright: 'composition' },
      ]),
    ).toBe(false)
  })

  it('fills house terms and clears the blank-deal blocker', () => {
    const packet = buildProducerAgreementPacket({
      releaseTitle: 'Night Drive',
      albumArtist: 'SERGIK',
      tracks: [{ title: 'Cut', contributors: [{ role: 'primary', name: 'SERGIK' }] }],
    })
    const blocked = counselGateForPacket({ text: packet.text, kind: 'producer_agreement', tracks: [] })
    expect(blocked.blockers.map((finding) => finding.id)).toContain('unfilled-blanks')

    const filled = applySergikStandardTerms(packet.text)
    expect(filled.filled).toEqual(expect.arrayContaining(['term', 'territory', 'governing law', 'forum', 'royalty base']))
    expect(filled.text).toMatch(/State of Arizona/)
    expect(filled.text).toMatch(/5 years/)
    const open = counselGateForPacket({ text: filled.text, kind: 'producer_agreement', tracks: [] })
    expect(open.blockers.map((finding) => finding.id)).not.toContain('unfilled-blanks')
  })

  it('accepts sample clearance only when both licenses are on file', () => {
    const open = auditMusicCounsel({
      dealKind: 'sample',
      tracks: [{ title: 'Cut', contains_samples: true, splits: [{ name: 'SERGIK', percentage: 100 }] }],
    })
    expect(open.findings.some((finding) => finding.id.startsWith('samples-'))).toBe(true)

    const cleared = auditMusicCounsel({
      dealKind: 'sample',
      tracks: [
        {
          title: 'Cut',
          contains_samples: true,
          splits: [{ name: 'SERGIK', percentage: 100 }],
          clearance: {
            sample_master: { status: 'on_file', reference: 'license-m-1' },
            sample_composition: { status: 'on_file', reference: 'license-c-1' },
          },
        },
      ],
    })
    expect(cleared.findings.some((finding) => finding.id.startsWith('samples-'))).toBe(false)
  })
})
