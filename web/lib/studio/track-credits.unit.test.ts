import { describe, expect, it } from 'vitest'
import {
  contributorsFromCreditFields,
  contributorsFromVault,
  creditFieldsFromContributors,
  creditsBlockFromContributors,
  displayArtistLine,
  mergeContributors,
  parseBilledArtists,
  parseContributors,
  primaryArtist,
  storeTitleFromArtistPrefix,
} from '@/lib/studio/track-credits'

describe('parseBilledArtists', () => {
  it('splits collab billing', () => {
    expect(parseBilledArtists('SERGIK x OG Coconut')).toEqual({
      primary: ['SERGIK', 'OG Coconut'],
      featured: [],
    })
  })

  it('reads feat. credits', () => {
    expect(parseBilledArtists('SERGIK feat. Mira')).toEqual({
      primary: ['SERGIK'],
      featured: ['Mira'],
    })
  })
})

describe('contributorsFromVault', () => {
  it('uses vault artist collabs', () => {
    const rows = contributorsFromVault({
      artist: 'SERGIK x OG Coconut',
      title: 'OG Coconut - What you want',
    })
    expect(displayArtistLine(rows)).toBe('SERGIK x OG Coconut')
    expect(primaryArtist(rows)).toBe('SERGIK')
    expect(rows.filter((row) => row.role === 'primary').map((row) => row.name)).toEqual([
      'SERGIK',
      'OG Coconut',
    ])
  })

  it('promotes a title collaborator when artist is solo', () => {
    const rows = contributorsFromVault({
      artist: 'SERGIK',
      title: 'OG Coconut - What you want',
    })
    expect(displayArtistLine(rows)).toBe('SERGIK feat. OG Coconut')
  })

  it('defaults to SERGIK', () => {
    expect(displayArtistLine(contributorsFromVault({ title: 'It Is What It Is' }))).toBe('SERGIK')
  })
})

describe('parse and merge contributors', () => {
  it('keeps saved credits over inferred', () => {
    const saved = parseContributors([{ role: 'primary', name: 'SERGIK' }])
    const merged = mergeContributors(
      saved,
      contributorsFromVault({ artist: 'SERGIK x OG Coconut' }),
    )
    expect(merged).toEqual(saved)
  })

  it('fills empty credits from vault', () => {
    const merged = mergeContributors([], contributorsFromVault({ artist: 'SERGIK x OG Coconut' }))
    expect(displayArtistLine(merged)).toBe('SERGIK x OG Coconut')
  })

  it('rebuilds from credit fields', () => {
    const rows = contributorsFromCreditFields({
      primary: 'SERGIK, OG Coconut',
      featured: 'Mira',
      vocalist: 'Mira',
      writer: 'SERGIK',
      producer: 'SERGIK',
      mixer: 'SERGIK',
      mastering: 'SERGIK',
      instruments: [{ instrument: 'Bass', name: 'OG Coconut' }],
    })
    expect(displayArtistLine(rows)).toBe('SERGIK x OG Coconut feat. Mira')
    expect(creditsBlockFromContributors(rows, 2026)).toMatch(/Featuring: Mira/)
    expect(creditsBlockFromContributors(rows, 2026)).toMatch(/Vocals: Mira/)
    expect(creditsBlockFromContributors(rows, 2026)).toMatch(/Bass — OG Coconut/)
    expect(creditsBlockFromContributors(rows, 2026)).toMatch(/Mixed by SERGIK/)
    expect(creditsBlockFromContributors(rows, 2026)).toMatch(/Mastered by SERGIK/)
  })

  it('round-trips vocalist and instrument credits', () => {
    const rows = parseContributors([
      { role: 'primary', name: 'SERGIK' },
      { role: 'vocalist', name: 'BeJanis' },
      { role: 'instrument', name: 'Slick Floyd', instrument: 'Keys' },
    ])
    const fields = creditFieldsFromContributors(rows)
    expect(fields.vocalist).toBe('BeJanis')
    expect(fields.instruments).toEqual([{ instrument: 'Keys', name: 'Slick Floyd' }])
    expect(contributorsFromCreditFields(fields)).toEqual([
      ...rows,
      { role: 'producer', name: 'SERGIK' },
    ])
  })

  it('defaults producer to primary for Apple Music', () => {
    const rows = contributorsFromCreditFields({ primary: 'SERGIK' })
    expect(rows.filter((row) => row.role === 'producer')).toEqual([
      { role: 'producer', name: 'SERGIK' },
    ])
    expect(
      contributorsFromVault({ artist: 'SERGIK', title: 'Night Drive' }).some(
        (row) => row.role === 'producer' && row.name === 'SERGIK',
      ),
    ).toBe(true)
  })

  it('drops a featured name already billed as primary', () => {
    const rows = parseContributors([
      { role: 'primary', name: 'SERGIK x OG Coconut' },
      { role: 'featured', name: 'OG Coconut' },
    ])
    expect(displayArtistLine(rows)).toBe('SERGIK x OG Coconut')
    expect(rows.filter((row) => row.role === 'featured')).toEqual([])
  })
})

describe('storeTitleFromArtistPrefix', () => {
  it('strips a billed collaborator prefix', () => {
    expect(
      storeTitleFromArtistPrefix('OG Coconut - What you want', ['SERGIK', 'OG Coconut']),
    ).toEqual({ title: 'What you want', prefix: 'OG Coconut' })
  })

  it('keeps titles that are not artist prefixes', () => {
    expect(storeTitleFromArtistPrefix('Are We Awake?', ['SERGIK'])).toEqual({
      title: 'Are We Awake?',
      prefix: null,
    })
  })
})
