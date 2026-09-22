import { describe, expect, it } from 'vitest'
import {
  appleCreditsReady,
  artworkPolicyWarnings,
  attestationsComplete,
  evaluateReleaseIngest,
  evaluateTrackIngest,
  mapSonicGenreToDsp,
  previewStoreTitle,
  streetDateHint,
  writerLegalNameIssues,
} from '@/lib/studio/dsp-ingest'

describe('mapSonicGenreToDsp', () => {
  it('maps Sonic DNA classes onto Apple/Spotify lists', () => {
    expect(mapSonicGenreToDsp('Funky House', null)).toEqual({
      primary: 'Dance',
      secondary: 'House',
      mapped: true,
    })
    expect(mapSonicGenreToDsp('Tech House', 'Melodic')).toEqual({
      primary: 'Electronic',
      secondary: 'Melodic',
      mapped: true,
    })
    expect(mapSonicGenreToDsp('House', 'Melodic House')).toEqual({
      primary: 'Dance',
      secondary: 'Melodic House',
      mapped: true,
    })
    expect(mapSonicGenreToDsp('Electronic', 'Tech House')).toEqual({
      primary: 'Electronic',
      secondary: 'Tech House',
      mapped: false,
    })
  })
})

describe('previewStoreTitle', () => {
  it('strips feat. from the printed title and warns', () => {
    const preview = previewStoreTitle({
      title: 'Midnight feat. Mira',
      featured: ['Mira'],
    })
    expect(preview.display).toBe('Midnight')
    expect(preview.warnings.some((warning) => /feat/i.test(warning))).toBe(true)
  })

  it('rejects years and emoji', () => {
    const preview = previewStoreTitle({ title: 'Warehouse 2026 🔥' })
    expect(preview.warnings.join(' ')).toMatch(/years/i)
    expect(preview.warnings.join(' ')).toMatch(/emoji/i)
  })

  it('puts remixer in version brackets', () => {
    const preview = previewStoreTitle({
      title: 'Are We Awake?',
      remixer: ['OG Coconut'],
    })
    expect(preview.display).toBe('Are We Awake? [OG Coconut Remix]')
  })

  it('warns when a cover title includes the original artist', () => {
    const preview = previewStoreTitle({
      title: 'Billie Jean (Michael Jackson cover)',
      origin: 'cover',
      coverOriginalArtist: 'Michael Jackson',
    })
    expect(preview.warnings.join(' ')).toMatch(/original artist/i)
  })

  it('strips a billed artist prefix from the store title', () => {
    const preview = previewStoreTitle({
      title: 'OG Coconut - What you want',
      billedArtists: ['SERGIK', 'OG Coconut'],
    })
    expect(preview.display).toBe('What you want')
    expect(preview.warnings.join(' ')).toMatch(/store title/i)
  })
})

describe('writerLegalNameIssues', () => {
  it('rejects empty and stage names', () => {
    expect(writerLegalNameIssues('')).toHaveLength(1)
    expect(writerLegalNameIssues('SERGIK')[0]).toMatch(/stage name/i)
    expect(writerLegalNameIssues('Jordan Caboga')).toEqual([])
  })

  it('requires a legal name for each billed collaborator', () => {
    const issues = writerLegalNameIssues(
      'Jordan Caboga',
      ['SERGIK'],
      [
        { role: 'primary', name: 'SERGIK' },
        { role: 'primary', name: 'OG Coconut' },
        { role: 'producer', name: 'SERGIK' },
      ],
    )
    expect(issues.join(' ')).toMatch(/OG Coconut/)
  })
})

describe('appleCreditsReady', () => {
  it('treats primary as producer when producer credit is missing', () => {
    expect(appleCreditsReady([{ role: 'primary', name: 'SERGIK' }]).ok).toBe(true)
    expect(
      appleCreditsReady([
        { role: 'primary', name: 'SERGIK' },
        { role: 'producer', name: 'SERGIK' },
      ]).ok,
    ).toBe(true)
    expect(appleCreditsReady([]).ok).toBe(false)
    expect(appleCreditsReady([]).missing).toContain('performer')
  })
})

describe('artwork and street date', () => {
  it('flags reused covers and store-logo filenames', () => {
    expect(artworkPolicyWarnings({ reused: true })[0]).toMatch(/already used/i)
    expect(artworkPolicyWarnings({ fileName: 'spotify-cover.jpg' })[0]).toMatch(/store logos/i)
  })

  it('warns when street date is under a week out', () => {
    const hint = streetDateHint('2026-09-18', new Date('2026-09-17T12:00:00'))
    expect(hint.daysAhead).toBe(1)
    expect(hint.warning).toMatch(/one week/i)
  })
})

describe('evaluateReleaseIngest', () => {
  const readyTrack = {
    id: 't1',
    title: 'Are We Awake?',
    contributors: [
      { role: 'primary', name: 'SERGIK' },
      { role: 'producer', name: 'SERGIK' },
    ],
    origin: 'original',
    writer_legal_names: 'Jordan Caboga',
    ai_generated: false,
  }

  it('blocks missing DistroKid-required ingest fields', () => {
    const result = evaluateReleaseIngest({ title: 'Are We Awake?' }, [])
    expect(result.ok).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/DSP primary genre/)
    expect(result.blockers.join(' ')).toMatch(/previously released/)
    expect(result.blockers.join(' ')).toMatch(/attestations/)
  })

  it('passes a complete original single', () => {
    const result = evaluateReleaseIngest(
      {
        title: 'Are We Awake?',
        genre: 'Electronic',
        subgenre: 'Tech House',
        release_date: '2026-10-01',
        previously_released: false,
        artwork_owned: true,
        youtube_artist_id: 'UCBWcROfNv8PeY6KdrnNM_pw',
        instagram_handle: 'sergikdropz',
        facebook_page_id: 'sergikdropz',
        ingest_attestations: {
          worldwide_rights: true,
          no_other_artist_names: true,
          no_fake_streams: true,
          youtube_music_understood: true,
          artwork_owned: true,
        },
      },
      [{ ...readyTrack, preview_start_seconds: 45 }],
    )
    expect(result.blockers).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.checks.artist_profiles).toBe(true)
    expect(result.checks.preview_clip).toBe(true)
  })

  it('keeps recommended artist match and preview clip as soft warnings', () => {
    const result = evaluateReleaseIngest(
      {
        title: 'Are We Awake?',
        genre: 'Electronic',
        release_date: '2026-10-01',
        previously_released: false,
        artwork_owned: true,
        ingest_attestations: {
          worldwide_rights: true,
          no_other_artist_names: true,
          no_fake_streams: true,
          youtube_music_understood: true,
          artwork_owned: true,
        },
      },
      [readyTrack],
    )
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/YouTube channel/)
    expect(result.warnings.join(' ')).toMatch(/preview clip/)
    expect(result.checks.artist_profiles).toBe(false)
    expect(result.checks.preview_clip).toBe(false)
  })

  it('requires original title/artist on covers', () => {
    const result = evaluateReleaseIngest(
      {
        title: 'Cover Night',
        genre: 'Electronic',
        previously_released: false,
        artwork_owned: true,
        ingest_attestations: {
          worldwide_rights: true,
          no_other_artist_names: true,
          no_fake_streams: true,
          youtube_music_understood: true,
          artwork_owned: true,
        },
      },
      [{ ...readyTrack, origin: 'cover', cover_original_title: '', cover_original_artist: '' }],
    )
    expect(result.blockers.join(' ')).toMatch(/Cover songs/)
  })

  it('requires original masters and ISRCs when previously released', () => {
    const result = evaluateReleaseIngest(
      {
        title: 'Soul Candy',
        genre: 'Electronic',
        release_date: '2026-10-01',
        previously_released: true,
        previous_upc: '198704123456',
        upc: '198704123456',
        artwork_owned: true,
        ingest_attestations: {
          worldwide_rights: true,
          no_other_artist_names: true,
          no_fake_streams: true,
          youtube_music_understood: true,
          artwork_owned: true,
        },
      },
      [
        {
          ...readyTrack,
          isrc_full: null,
          wav_url: null,
        },
      ],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/Reuse the live ISRCs/)
    expect(result.blockers.join(' ')).toMatch(/exact original master/)
    expect(result.checks.stream_continuity_isrcs).toBe(false)
    expect(result.checks.stream_continuity_masters).toBe(false)
  })

  it('passes previously released when ISRCs and masters are present', () => {
    const result = evaluateReleaseIngest(
      {
        title: 'Soul Candy',
        genre: 'Electronic',
        release_date: '2026-10-01',
        previously_released: true,
        previous_upc: '198704123456',
        upc: '198704123456',
        store_link_count: 2,
        artwork_owned: true,
        youtube_artist_id: 'UCBWcROfNv8PeY6KdrnNM_pw',
        instagram_handle: 'sergikdropz',
        facebook_page_id: 'sergikdropz',
        ingest_attestations: {
          worldwide_rights: true,
          no_other_artist_names: true,
          no_fake_streams: true,
          youtube_music_understood: true,
          artwork_owned: true,
        },
      },
      [
        {
          ...readyTrack,
          isrc_full: 'QZES72569811',
          wav_url: 'https://cdn.example/soul-candy.wav',
          preview_start_seconds: 45,
        },
      ],
    )
    expect(result.blockers).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.checks.stream_continuity_isrcs).toBe(true)
    expect(result.checks.stream_continuity_masters).toBe(true)
  })

  it('blocks collabs missing songwriter legal names or split shares', () => {
    const issues = evaluateTrackIngest({
      ...readyTrack,
      contributors: [
        { role: 'primary', name: 'SERGIK' },
        { role: 'primary', name: 'OG Coconut' },
        { role: 'producer', name: 'SERGIK' },
      ],
      writer_legal_names: 'Jordan Caboga',
      splits: [{ name: 'SERGIK', percentage: 100 }],
    })
    expect(issues.some((item) => /OG Coconut/.test(item.label) && item.id.startsWith('writer'))).toBe(
      true,
    )
    expect(issues.some((item) => item.id.startsWith('splits:') && /OG Coconut/.test(item.label))).toBe(
      true,
    )
  })
})

describe('attestationsComplete', () => {
  it('needs every required box', () => {
    expect(attestationsComplete({ worldwide_rights: true })).toBe(false)
    expect(
      attestationsComplete({
        worldwide_rights: true,
        no_other_artist_names: true,
        no_fake_streams: true,
        youtube_music_understood: true,
        artwork_owned: true,
      }),
    ).toBe(true)
  })
})
