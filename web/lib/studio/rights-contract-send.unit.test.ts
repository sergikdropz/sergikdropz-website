import { describe, expect, it } from 'vitest'
import {
  contractSignatories,
  isValidPartyEmail,
  mergePartyContacts,
  parsePartyContacts,
  signatoriesReadyToSend,
  stageFromPartyLabel,
} from '@/lib/studio/rights-contract-send'
import { buildCollabAgreementPacket, buildSplitSheetPacket } from '@/lib/studio/rights-packets'

describe('rights contract send', () => {
  it('parses and merges party contacts', () => {
    expect(parsePartyContacts([{ stage: 'OG Coconut', email: 'og@example.com' }])).toEqual([
      { stage: 'OG Coconut', email: 'og@example.com' },
    ])
    expect(isValidPartyEmail('bad')).toBe(false)
    expect(
      mergePartyContacts(
        [{ stage: 'OG Coconut', email: 'old@example.com' }],
        [{ stage: 'OG Coconut', email: 'new@example.com' }, { stage: 'Guest', email: 'g@x.com' }],
      ),
    ).toEqual([
      { stage: 'OG Coconut', email: 'new@example.com' },
      { stage: 'Guest', email: 'g@x.com' },
    ])
  })

  it('maps packet parties to signatories and skips SERGIK', () => {
    const packet = buildSplitSheetPacket({
      releaseTitle: 'Are We Awake?',
      albumArtist: 'SERGIK',
      tracks: [
        {
          title: 'What you want',
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'primary', name: 'OG Coconut', email: 'og@example.com' },
          ],
          splits: [
            { name: 'SERGIK', percentage: 50, legal_name: 'Jordan Caboga' },
            { name: 'OG Coconut', percentage: 50 },
          ],
        },
      ],
    })
    const rows = contractSignatories(packet, [], [{ stage: 'OG Coconut', email: 'og@example.com' }])
    expect(rows.find((row) => row.stage === 'SERGIK')?.skip).toBe(true)
    expect(rows.find((row) => row.stage.includes('OG Coconut') || row.stage === 'OG Coconut')?.email).toBe(
      'og@example.com',
    )
    const ready = signatoriesReadyToSend(rows)
    expect(ready.ok).toBe(true)
    expect(ready.recipients).toEqual([{ stage: 'OG Coconut', email: 'og@example.com' }])
  })

  it('requires collaborator emails before send', () => {
    const packet = buildCollabAgreementPacket({
      releaseTitle: 'Are We Awake?',
      tracks: [
        {
          title: 'What you want',
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'primary', name: 'OG Coconut' },
          ],
          writer_legal_names: JSON.stringify([
            { stage: 'SERGIK', legal: 'Jordan Caboga' },
            { stage: 'OG Coconut', legal: 'Alex Coconut' },
          ]),
          splits: [
            { name: 'SERGIK', percentage: 50 },
            { name: 'OG Coconut', percentage: 50 },
          ],
        },
      ],
    })
    expect(packet.ready).toBe(true)
    const rows = contractSignatories(packet, [], [])
    expect(signatoriesReadyToSend(rows).missing).toContain('OG Coconut')
  })

  it('strips legal suffix from party labels', () => {
    expect(stageFromPartyLabel('SERGIK (Jordan Caboga)')).toBe('SERGIK')
  })
})
