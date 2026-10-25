import { describe, expect, it } from 'vitest'
import {
  matchDistrokidIsrcs,
  pickDistroKidAlbum,
} from '@/lib/studio/pull-distrokid-isrcs'

const staying = [
  { id: 'pre', title: 'Pre Party', track_number: 1, isrc_full: null },
  { id: 'teq', title: 'Tequila Power', track_number: 2, isrc_full: 'QTA532600002' },
  { id: 'hyd', title: 'Hydrate Feat. Janis and the Planets', track_number: 3, isrc_full: null },
  { id: 'mind', title: 'Mind n Body', track_number: 4, isrc_full: null },
  { id: 'last', title: 'Last Night', track_number: 5, isrc_full: null },
]

describe('matchDistrokidIsrcs', () => {
  it('writes DistroKid codes onto the EP order, including a shorter DistroKid title', () => {
    const { matches, unmatchedCodes } = matchDistrokidIsrcs(staying, [
      { n: 1, title: 'Pre Party', isrc: 'QZ-A53-26-00001' },
      { n: 2, title: 'Tequila Power', isrc: 'QZA532600002' },
      { n: 3, title: 'Hydrate', isrc: 'QZA532600003' },
      { n: 4, title: 'Mind n Body', isrc: 'QZA532600004' },
      { n: 5, title: 'Last Night', isrc: 'QZA532600005' },
    ])

    expect(unmatchedCodes).toEqual([])
    expect(matches.find((row) => row.trackId === 'hyd')?.isrc).toBe('QZA532600003')
    expect(matches.find((row) => row.trackId === 'teq')?.changed).toBe(true)
    expect(matches.find((row) => row.trackId === 'pre')?.changed).toBe(true)
    expect(matches).toHaveLength(5)
  })

  it('leaves a track unchanged when the DistroKid code is already stored', () => {
    const { matches } = matchDistrokidIsrcs(
      [{ id: 'pre', title: 'Pre Party', track_number: 1, isrc_full: 'QZ-A53-26-00001' }],
      [{ n: 1, title: 'Pre Party', isrc: 'QZA532600001' }],
    )
    expect(matches[0].changed).toBe(false)
  })
})

describe('pickDistroKidAlbum', () => {
  it('prefers the album whose row contains the release UPC', () => {
    const picked = pickDistroKidAlbum(
      [
        { albumuuid: 'AAA', title: 'Staying A Vibe', text: 'Staying A Vibe 5 tracks' },
        { albumuuid: 'BBB', title: 'Other', text: 'Other UPC 700563968501' },
      ],
      { title: 'Staying A Vibe', upc: '700563968501' },
    )
    expect(picked?.albumuuid).toBe('BBB')
  })

  it('matches a unique album title and skips a tie', () => {
    expect(
      pickDistroKidAlbum(
        [{ albumuuid: 'D908E9D1-1514-4C04-988C051A39FFAE34', title: 'Staying A Vibe', text: 'Staying A Vibe 5 tracks Sergik' }],
        { title: 'Staying A Vibe' },
      )?.albumuuid,
    ).toContain('D908E9D1')

    expect(
      pickDistroKidAlbum(
        [
          { albumuuid: 'ONE', title: 'Staying A Vibe', text: 'Staying A Vibe' },
          { albumuuid: 'TWO', title: 'Staying A Vibe', text: 'Staying A Vibe' },
        ],
        { title: 'Staying A Vibe' },
      ),
    ).toBeNull()
  })
})
