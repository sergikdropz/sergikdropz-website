import { describe, expect, it } from 'vitest'
import {
  addIsoDays,
  buildDistroKidPacket,
  buildDistroKidQueue,
  evaluateDistroKidWindow,
  parseDistroKidDelivery,
  resolveDeliveryPipe,
} from '@/lib/studio/distrokid-delivery'

const TODAY = '2026-09-23'

function readyRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    title: 'UTOPIA',
    type: 'ep',
    release_date: '2026-10-30',
    artwork_url: 'https://cdn.example/art.jpg',
    genre: 'Reggae',
    language: 'en',
    album_artist: 'SERGIK',
    label_name: 'SERGIKdropz',
    upc: '199083322052',
    previously_released: false,
    distributor_status: 'draft',
    tracks: [
      {
        title: 'Utopia',
        isrc: 'QTA532600001',
        wav_url: 'https://cdn.example/utopia.wav',
        explicit: false,
        track_number: 1,
        contributors: [{ role: 'primary', name: 'SERGIK' }, { role: 'writer', name: 'SERGIK' }],
        writer_legal_names: 'Jordan Caboga',
      },
    ],
    ...overrides,
  }
}

describe('distrokid delivery pipe', () => {
  it('uses DistroKid until Revelator is live', () => {
    expect(resolveDeliveryPipe({ label: 'dry_run', dryRun: true }).id).toBe('distrokid')
    expect(resolveDeliveryPipe({ label: 'unavailable', dryRun: true }).id).toBe('distrokid')
    expect(resolveDeliveryPipe({ label: 'live', dryRun: false }).id).toBe('revelator')
  })

  it('opens the upload window 28 days before street and flags the last 14 as late', () => {
    expect(addIsoDays('2026-10-30', -28)).toBe('2026-10-02')
    expect(
      evaluateDistroKidWindow({ release_date: '2026-10-30', today: TODAY, distributor_status: 'draft' }).kind,
    ).toBe('scheduled')
    expect(
      evaluateDistroKidWindow({ release_date: '2026-10-21', today: TODAY, distributor_status: 'draft' }).kind,
    ).toBe('due')
    expect(
      evaluateDistroKidWindow({ release_date: '2026-10-07', today: TODAY, distributor_status: 'draft' }).kind,
    ).toBe('late')
    expect(
      evaluateDistroKidWindow({
        release_date: '2026-10-30',
        today: TODAY,
        record: { status: 'submitted', albumuuid: 'abc' },
      }).kind,
    ).toBe('submitted')
  })

  it('builds a copy-ready packet and blocks missing ISRC, label, and legal names', () => {
    const packet = buildDistroKidPacket(readyRelease())
    expect(packet.ok).toBe(true)
    expect(packet.release.label).toBe('SERGIKdropz')
    expect(packet.release.release_date).toBe('2026-10-30')
    expect(packet.tracks[0]?.songwriters).toBe('Jordan Caboga')
    expect(packet.tracks[0]?.isrc).toBe('QTA532600001')
    expect(packet.csv).toContain('SERGIKdropz')
    expect(packet.worksheet).toContain('https://distrokid.com/new/')

    const blocked = buildDistroKidPacket(
      readyRelease({
        label_name: 'SERGIK',
        tracks: [{ title: 'Utopia', wav_url: 'https://cdn.example/a.wav', writer_legal_names: 'SERGIK' }],
      }),
    )
    expect(blocked.ok).toBe(false)
    expect(blocked.blockers.join(' ')).toMatch(/SERGIKdropz/)
    expect(blocked.blockers.join(' ')).toMatch(/ISRC/)
    expect(blocked.blockers.join(' ')).toMatch(/stage name/i)
  })

  it('sorts the slate with late uploads first and old street dates last', () => {
    const queue = buildDistroKidQueue(
      [
        readyRelease({ id: 'old', title: 'How Ya', release_date: '2024-03-26' }),
        readyRelease({ id: 'later', title: 'Daze', release_date: '2026-12-11' }),
        readyRelease({ id: 'soon', title: 'UTOPIA', release_date: '2026-10-07' }),
      ],
      TODAY,
    )
    expect(queue.map((row) => row.id)).toEqual(['soon', 'later', 'old'])
    expect(queue[0]?.window.kind).toBe('late')
    expect(queue[2]?.window.kind).toBe('past_street')
  })

  it('reads the DistroKid stamp from marketing copy', () => {
    expect(parseDistroKidDelivery({ distrokid_delivery: { status: 'queued', queued_at: '2026-09-23' } })?.status).toBe(
      'queued',
    )
    expect(parseDistroKidDelivery({})).toBeNull()
  })
})
