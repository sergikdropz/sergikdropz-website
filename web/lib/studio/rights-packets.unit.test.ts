import { describe, expect, it } from 'vitest'
import {
  applyRightsPacketDrafts,
  buildCollabAgreementPacket,
  buildProducerAgreementPacket,
  buildRightsPackets,
  buildSplitSheetPacket,
  rightsPacketApprovePatch,
} from '@/lib/studio/rights-packets'

describe('rights packets', () => {
  it('builds a split sheet from Catalog ownership rows', () => {
    const packet = buildSplitSheetPacket({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      publisherName: 'SERGIK Music',
      generatedAt: '2026-09-17',
      tracks: [
        {
          title: 'It Is What It Is',
          isrc_full: 'QTA532600001',
          contributors: [{ role: 'primary', name: 'SERGIK' }],
          writer_legal_names: 'Jordan Caboga',
          splits: [{ name: 'SERGIK', percentage: 100, legal_name: 'Jordan Caboga', role: 'performer' }],
        },
        {
          title: 'What you want',
          isrc_full: 'QTA532600004',
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'primary', name: 'OG Coconut' },
          ],
          splits: [
            { name: 'SERGIK', percentage: 50, legal_name: 'Jordan Caboga', role: 'producer' },
            { name: 'OG Coconut', percentage: 50, role: 'producer' },
          ],
        },
      ],
    })
    expect(packet.ready).toBe(true)
    expect(packet.needed).toBe(true)
    expect(packet.text).toMatch(/SERGIK SPLIT SHEET/)
    expect(packet.text).toMatch(/Are We Awake\?/)
    expect(packet.text).toMatch(/What you want/)
    expect(packet.text).toMatch(/OG Coconut/)
    expect(packet.text).toMatch(/50%/)
    expect(packet.text).toMatch(/Jordan Caboga/)
    expect(rightsPacketApprovePatch(packet)).toEqual({ split_sheet_status: 'approved' })
  })

  it('flags incomplete splits', () => {
    const packet = buildSplitSheetPacket({
      releaseTitle: 'Are We Awake?',
      tracks: [{ title: 'No Stopping', splits: [{ name: 'SERGIK', percentage: 40 }] }],
    })
    expect(packet.ready).toBe(false)
    expect(packet.missing[0]).toMatch(/Splits incomplete/)
  })

  it('builds producer agreement from producer credits or album artist', () => {
    const packet = buildProducerAgreementPacket({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      tracks: [
        {
          title: 'Elevator Musik',
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'producer', name: 'SERGIK' },
          ],
        },
      ],
    })
    expect(packet.ready).toBe(true)
    expect(packet.text).toMatch(/SERGIK PRODUCER AGREEMENT/)
    expect(packet.text).toMatch(/Elevator Musik/)
    expect(packet.parties.join(' ')).toMatch(/SERGIK/)
  })

  it('builds collab agreement only when billed x or feat. artists exist', () => {
    const none = buildCollabAgreementPacket({
      releaseTitle: 'Are We Awake?',
      tracks: [{ title: 'No Stopping', contributors: [{ role: 'primary', name: 'SERGIK' }] }],
    })
    expect(none.needed).toBe(false)
    expect(none.ready).toBe(true)
    expect(none.text).toBe('')

    const collab = buildCollabAgreementPacket({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      tracks: [
        {
          title: 'What you want',
          isrc_full: 'QTA532600004',
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'primary', name: 'OG Coconut' },
          ],
          writer_legal_names: JSON.stringify([
            { stage: 'SERGIK', legal: 'Jordan Caboga' },
            { stage: 'OG Coconut', legal: '' },
          ]),
          splits: [
            { name: 'SERGIK', percentage: 50, legal_name: 'Jordan Caboga' },
            { name: 'OG Coconut', percentage: 50 },
          ],
        },
      ],
    })
    expect(collab.needed).toBe(true)
    expect(collab.ready).toBe(false)
    expect(collab.missing[0]).toMatch(/Legal name missing for OG Coconut/)
    expect(collab.text).toMatch(/SERGIK COLLABORATION AGREEMENT/)
    expect(collab.text).toMatch(/SERGIK x OG Coconut|Primary: SERGIK x OG Coconut/)
  })

  it('returns all three packets together', () => {
    const packets = buildRightsPackets({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      tracks: [
        {
          title: 'It Is What It Is',
          contributors: [{ role: 'primary', name: 'SERGIK' }],
          splits: [{ name: 'SERGIK', percentage: 100 }],
        },
      ],
    })
    expect(packets.map((row) => row.kind)).toEqual([
      'split_sheet',
      'producer_agreement',
      'collab_agreement',
    ])
  })

  it('overlays saved packet drafts', () => {
    const packets = buildRightsPackets({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      tracks: [
        {
          title: 'It Is What It Is',
          contributors: [{ role: 'primary', name: 'SERGIK' }],
          splits: [{ name: 'SERGIK', percentage: 100, legal_name: 'Jordan Caboga' }],
        },
      ],
    })
    const withDraft = applyRightsPacketDrafts(packets, {
      split_sheet: { text: 'MANUAL SPLIT SHEET' },
    })
    expect(withDraft[0]?.text).toBe('MANUAL SPLIT SHEET')
    expect(withDraft[0]?.summary).toMatch(/edited/)
    expect(withDraft[1]?.text).toBe(packets[1]?.text)
  })
})
