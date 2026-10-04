import { describe, expect, it } from 'vitest'
import { buildAppleMusicCreditLine } from '@/lib/studio/distrokid-apple-credits'

describe('distrokid apple credits', () => {
  it('defaults SERGIK tracks to Jordan Caboga performer + drum machine + producer', () => {
    const line = buildAppleMusicCreditLine({
      contributors: [
        { role: 'primary', name: 'SERGIK' },
        { role: 'writer', name: 'SERGIK' },
        { role: 'producer', name: 'SERGIK' },
      ],
      writer_legal_names: JSON.stringify([{ stage: 'SERGIK', legal: 'Jordan Caboga' }]),
    })
    expect(line.performer_name).toBe('Jordan Caboga')
    expect(line.performer_instrument).toBe('Drum Machine')
    expect(line.producer_name).toBe('Jordan Caboga')
  })
})
