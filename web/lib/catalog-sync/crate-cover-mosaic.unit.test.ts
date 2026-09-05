import { describe, expect, it } from 'vitest'
import { assignCrateMosaicCovers, collectLibraryCoverPool, crateMosaicCovers } from './crate-cover-mosaic'

describe('collectLibraryCoverPool', () => {
  it('dedupes resolved paths, query busts, and same filename on another host', () => {
    expect(
      collectLibraryCoverPool([
        '/images/audio/artwork/a.jpg?v=1',
        '/images/audio/artwork/a.jpg',
        'https://example.supabase.co/storage/v1/object/public/audio-files/artwork/a.jpg',
        'blob:http://localhost/1',
        '/images/audio/artwork/b.png',
        '',
      ]),
    ).toEqual(['/images/audio/artwork/a.jpg', '/images/audio/artwork/b.png'])
  })
})

describe('crateMosaicCovers', () => {
  const pool = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg', '/g.jpg', '/h.jpg', '/i.jpg', '/j.jpg']

  it('returns unique covers and is stable for the same crate', () => {
    const first = crateMosaicCovers(pool, 'crate-deep-n-funky')
    const second = crateMosaicCovers(pool, 'crate-deep-n-funky')
    expect(first).toHaveLength(9)
    expect(new Set(first).size).toBe(9)
    expect(second).toEqual(first)
  })

  it('shuffles each crate differently', () => {
    const a = crateMosaicCovers(pool, 'Deep n Funky')
    const b = crateMosaicCovers(pool, 'Feelin Sendy')
    expect(a).not.toEqual(b)
  })

  it('does not repeat when the pool is smaller than nine', () => {
    expect(crateMosaicCovers(['/only.jpg', '/only.jpg?v=2'], 'crate')).toEqual(['/only.jpg'])
  })
})

describe('assignCrateMosaicCovers', () => {
  const pool = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg']

  it('never reuses a cover across the crate group', () => {
    const assigned = assignCrateMosaicCovers(pool, ['one', 'two', 'three'])
    const used = Object.values(assigned).flat()
    expect(used).toHaveLength(6)
    expect(new Set(used).size).toBe(6)
    expect(assigned.one.length + assigned.two.length + assigned.three.length).toBe(6)
  })

  it('is stable for the same crate ids', () => {
    expect(assignCrateMosaicCovers(pool, ['one', 'two'])).toEqual(assignCrateMosaicCovers(pool, ['one', 'two']))
  })
})
