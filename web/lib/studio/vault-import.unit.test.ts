import { describe, expect, it } from 'vitest'
import {
  buildVaultReleaseDraft,
  catalogCopyFacts,
  catalogCopyPromptDigest,
  descriptionFromSonicDna,
  dnaCopyInputFromCatalog,
  dnaCopyInputFromDraft,
  isAnalysisCopy,
  marketingCopyFromDna,
  mergeGeneratedMarketingCopy,
  mergeStudioTrackIdentity,
  mergeVaultDistributionMetadata,
  releaseDescriptionFromCatalog,
  releaseDescriptionFromVault,
  studioTypeFromFolderType,
  vaultSoftReadiness,
} from '@/lib/studio/vault-import'

describe('studioTypeFromFolderType', () => {
  it('maps folder types', () => {
    expect(studioTypeFromFolderType('album')).toBe('album')
    expect(studioTypeFromFolderType('ep')).toBe('ep')
    expect(studioTypeFromFolderType('single')).toBe('single')
    expect(studioTypeFromFolderType('folder')).toBe('single')
  })
})

describe('descriptionFromSonicDna', () => {
  it('prefers long description fields', () => {
    expect(
      descriptionFromSonicDna({
        summary: 'A short blurb that is long enough to seed marketing copy for the release.',
      }),
    ).toMatch(/short blurb/)
  })

  it('returns null for empty dna', () => {
    expect(descriptionFromSonicDna(null)).toBeNull()
    expect(descriptionFromSonicDna({})).toBeNull()
  })

  it('skips encyclopedia voice', () => {
    expect(
      descriptionFromSonicDna({
        summary:
          'Groove class Experimental Bass / Broken 808 from measured usage, not from a crate name.',
      }),
    ).toBeNull()
  })
})

describe('releaseDescriptionFromVault', () => {
  it('writes a short unique release note from analysis DNA', () => {
    const note = releaseDescriptionFromVault({
      id: 'trk-it-is',
      title: 'It Is What It Is',
      bpm: 124,
      key_signature: 'C# major',
      genre: 'Funky House',
      subgenre: 'Boogie',
      sonic_dna: {
        measured: {
          drumFamily: 'breakbeat',
          intelligence: {
            description:
              'Groove class Experimental Bass / Broken 808 from measured usage, not from a crate name. Kick is used syncopated/broken, not as a house pulse.',
            intention: 'Open space so bass and delay can act as architecture.',
          },
        },
      },
    })
    expect(note).toMatch(/It Is What It Is — Open space so bass and delay/)
    expect(note).toMatch(/124 BPM/)
    expect(note).not.toMatch(/Groove class|measured usage|crate name|Kick is used/i)
    expect(isAnalysisCopy(note)).toBe(false)
  })

  it('replaces persisted encyclopedia copy with live release notes', () => {
    const live = {
      description: 'A tighter 127 BPM warehouse cut with hats that ride the bar.',
      genre: 'Tech House',
      subgenre: 'Melodic',
      bpm: 127,
      key_signature: 'A# minor',
      scale: null,
      energy: 3.5,
      danceability: 7.4,
      drum_style: 'Breakbeat',
      time_signature: '4/4',
      timing_feel: 'full-time',
      intention: 'Push the 2am room.',
      instruments: ['kick'],
      dna_complete: true,
    }
    const merged = mergeStudioTrackIdentity(
      {
        description:
          'Groove class Experimental Bass / Broken 808 from measured usage, not from a crate name.',
      },
      live,
    )
    expect(merged.description).toBe(live.description)
  })

  it('keeps journalist copy after a manual Catalog edit', () => {
    const live = {
      description: 'Wake — A 124 BPM house cut for the floor.',
      genre: 'House',
      subgenre: null,
      bpm: 124,
      key_signature: 'A minor',
      scale: null,
      energy: 6,
      danceability: 8,
      drum_style: 'Four-on-the-floor',
      time_signature: '4/4',
      timing_feel: 'full-time',
      intention: 'Wake the floor.',
      instruments: ['kick'],
      dna_complete: true,
    }
    const merged = mergeStudioTrackIdentity(
      {
        description:
          '"OG Coconut – What You Want" arrives with a quiet confidence that earns the room.',
        intention: 'Earn the room.',
        press_source: 'edited',
      },
      live,
    )
    expect(merged.description).toMatch(/quiet confidence/)
    expect(merged.intention).toBe('Earn the room.')
    expect(merged.press_source).toBe('edited')
  })
})

describe('buildVaultReleaseDraft', () => {
  it('autofills release + linked track drafts from folder and DNA', () => {
    const { release, tracks } = buildVaultReleaseDraft(
      {
        id: 'folder-ep-1',
        name: 'Night Drive',
        type: 'ep',
        artwork_url: '/art/night.jpg',
        year: 2024,
        genre: null,
      },
      [
        {
          id: 'trk-1',
          title: 'Neon',
          file_url: 'https://cdn.example/neon.mp3',
          display_order: 1,
          genre: 'House',
          sonic_dna: {
            genres: { primaryGenres: ['House'], subgenres: ['Melodic House'] },
            summary:
              'Late-night melodic house built for long drives and warm club rooms across the city.',
          },
          sonic_dna_status: 'complete',
        },
        {
          id: 'trk-2',
          title: 'Horizon',
          file_url: 'https://cdn.example/horizon.mp3',
          display_order: 2,
        },
      ],
    )

    expect(release.title).toBe('Night Drive')
    expect(release.type).toBe('ep')
    expect(release.artwork_url).toBe('/art/night.jpg')
    expect(release.release_date).toBe('2024-01-01')
    expect(release.genre).toBe('Dance')
    expect(release.subgenre).toBe('Melodic House')
    expect(release.description).toMatch(/two-track EP listen/i)
    expect(release.description).toMatch(/House \/ Melodic House/)
    expect(release.description).toMatch(/Neon/)
    expect(release.description).toMatch(/Horizon/)
    expect(release.source_folder_id).toBe('folder-ep-1')
    expect(tracks).toHaveLength(2)
    expect(tracks[0]?.music_library_track_id).toBe('trk-1')
    expect(tracks[0]?.wav_url).toContain('neon.mp3')
    expect(tracks[0]?.dna_complete).toBe(true)
    expect(tracks[0]?.identity.description).toMatch(/Late-night/)
    expect(tracks[0]?.identity.genre).toBe('House')
    expect(tracks[1]?.identity.description).toBeNull()
    expect(tracks[1]?.identity.genre).toBeNull()
    expect(tracks[0]?.contributors[0]).toMatchObject({ role: 'primary', name: 'SERGIK' })
  })

  it('treats Sonic DNA payload as complete when audio_files status is absent', () => {
    const { tracks } = buildVaultReleaseDraft(
      { id: 'folder-ep-2', name: 'Are We Awake?', type: 'ep' },
      [
        {
          id: 'trk-awake',
          title: 'Are We Awake?',
          file_url: 'https://cdn.example/awake.mp3',
          sonic_dna: { genres: { primaryGenres: ['Techno'] } },
        },
      ],
    )
    expect(tracks[0]?.dna_complete).toBe(true)
    expect(tracks[0]?.genre).toBe('Techno')
  })

  it('captures billed collabs from vault artist', () => {
    const { tracks } = buildVaultReleaseDraft(
      { id: 'folder-ep-collab', name: 'Are We Awake?', type: 'ep', album_artist: 'SERGIK' },
      [
        {
          id: 'trk-collab',
          title: 'OG Coconut - What you want',
          artist: 'SERGIK x OG Coconut',
          file_url: 'https://cdn.example/want.mp3',
        },
      ],
    )
    expect(tracks[0]?.contributors.filter((row) => row.role === 'primary').map((row) => row.name)).toEqual([
      'SERGIK',
      'OG Coconut',
    ])
    expect(tracks[0]?.contributors.some((row) => row.role === 'producer' && row.name === 'SERGIK')).toBe(
      true,
    )
  })

  it('keeps a unique DNA card per track', () => {
    const { tracks } = buildVaultReleaseDraft(
      { id: 'folder-ep-3', name: 'Are We Awake?', type: 'ep' },
      [
        {
          id: 'trk-a',
          title: 'Are We Awake?',
          file_url: 'https://cdn.example/a.mp3',
          display_order: 1,
          bpm: 124,
          key_signature: 'A minor',
          sonic_dna: {
            summary: 'A 6am warehouse cut with a dry kick and patient hats that never rush the bar.',
            genres: { primaryGenres: ['Tech House'], subgenres: ['Melodic'] },
            intention: { summary: 'Wake the floor without breaking the hypnotic loop.' },
          },
        },
        {
          id: 'trk-b',
          title: 'Second Sight',
          file_url: 'https://cdn.example/b.mp3',
          display_order: 2,
          bpm: 118,
          key_signature: 'F minor',
          sonic_dna: {
            summary: 'A slower boogie bassline with vocal chops aimed at the after-hours room.',
            genres: { primaryGenres: ['Funky House'], subgenres: ['Boogie'] },
            intention: { summary: 'Keep bodies swaying when the lights come up.' },
          },
        },
      ],
    )
    expect(tracks[0]?.identity.description).toMatch(/Are We Awake\? — Wake the floor/)
    expect(tracks[0]?.identity.description).toMatch(/124 BPM/)
    expect(tracks[0]?.identity.bpm).toBe(124)
    expect(tracks[0]?.identity.key_signature).toBe('A minor')
    expect(tracks[1]?.identity.description).toMatch(/Second Sight — Keep bodies swaying/)
    expect(tracks[1]?.identity.bpm).toBe(118)
    expect(tracks[1]?.identity.genre).toBe('Funky House')
    expect(tracks[0]?.identity.description).not.toBe(tracks[1]?.identity.description)
  })

  it('reads encyclopedia copy from measured intelligence per track', () => {
    const { release, tracks } = buildVaultReleaseDraft(
      { id: 'folder-ep-4', name: 'Are We Awake?', type: 'ep' },
      [
        {
          id: 'trk-it-is',
          title: 'It Is What It Is',
          file_url: 'https://cdn.example/it-is.mp3',
          display_order: 1,
          sonic_dna: {
            measured: {
              bpm: 123,
              key: 'C minor',
              genre: { primary: 'Experimental Bass', subgenre: 'Broken 808' },
              intelligence: {
                description:
                  'Groove class Experimental Bass with a syncopated kick that never sits as a house pulse.',
                intention: 'Keep the floor alert rather than lost in a pad bed.',
              },
              instruments: [{ label: 'bass', confidence: 0.9 }],
            },
          },
        },
        {
          id: 'trk-elevator',
          title: 'Elevator Musik',
          file_url: 'https://cdn.example/elevator.mp3',
          display_order: 2,
          sonic_dna: {
            measured: {
              bpm: 129,
              key: 'G minor',
              genre: { primary: 'Tech House', subgenre: 'Melodic' },
              intelligence: {
                description:
                  'A tighter tech-house clock with hats that ride the bar and a rolling low end.',
                intention: 'Push the 2am warehouse without breaking the hypnotic loop.',
              },
              instruments: [{ label: 'kick-drum', confidence: 0.8 }],
            },
          },
        },
      ],
    )

    expect(release.description).toMatch(/two-track EP listen/i)
    expect(release.description).toMatch(/It Is What It Is/)
    expect(release.description).toMatch(/Elevator Musik/)
    expect(tracks[0]?.identity.description).not.toMatch(/Groove class|measured usage|crate name/i)
    expect(tracks[0]?.identity.description).toMatch(/alert|123 BPM|Experimental Bass/)
    expect(tracks[0]?.identity.genre).toBe('Experimental Bass')
    expect(tracks[0]?.identity.bpm).toBe(123)
    expect(tracks[0]?.identity.intention).toBeNull()
    expect(tracks[1]?.identity.description).toMatch(/tech-house|129 BPM|Tech House/)
    expect(tracks[1]?.identity.description).not.toMatch(/Groove class|measured usage/i)
    expect(tracks[1]?.identity.bpm).toBe(129)
    expect(tracks[1]?.identity.genre).toBe('Tech House')
    expect(tracks[0]?.identity.description).not.toBe(tracks[1]?.identity.description)
    expect(tracks[0]?.identity.instruments).toContain('bass')
    expect(tracks[1]?.identity.instruments).toContain('kick-drum')
  })
})

describe('vaultSoftReadiness', () => {
  it('flags missing masters and vault links', () => {
    const soft = vaultSoftReadiness(
      [
        {
          music_library_track_id: 'a',
          wav_url: 'https://cdn.example/a.mp3',
          artwork_url: null,
        },
      ],
      '/art.jpg',
    )
    expect(soft.vaultLinked).toBe(true)
    expect(soft.needsMasterWav).toBe(true)
    expect(soft.hasArtwork).toBe(true)
  })
})

describe('marketingCopyFromDna', () => {
  it('builds copy from DNA fields and preserves vault meta on merge', () => {
    const generated = marketingCopyFromDna({
      title: 'Night Drive',
      genre: 'House',
      subgenre: 'Melodic House',
      description: 'Late-night melodic house built for long drives. Second sentence stays out of the hook.',
      artist: 'SERGIK',
      trackTitles: ['Neon', 'Horizon'],
      year: 2024,
    })
    expect(generated.elevator_pitch).toMatch(/Late-night/)
    expect(generated.elevator_pitch).not.toMatch(/Second sentence/)
    expect(generated.store_description).toMatch(/1\. Neon/)
    expect(generated.credits_block).toMatch(/2024/)

    const merged = mergeGeneratedMarketingCopy(
      { elevator_pitch: 'Keep me', _vault: { folderId: 'abc' } },
      generated,
      true,
    )
    expect(merged.elevator_pitch).toBe('Keep me')
    expect(merged.press_blurb).toMatch(/Late-night/)
    expect(merged._vault).toEqual({ folderId: 'abc' })
  })

  it('maps a vault draft into DNA copy input', () => {
    const { release, tracks } = buildVaultReleaseDraft(
      { id: 'f1', name: 'Night Drive', type: 'ep', year: 2024 },
      [{ id: 't1', title: 'Neon', sonic_dna: { summary: 'Late-night melodic house built for long drives and warm rooms.' } }],
    )
    const input = dnaCopyInputFromDraft({ release, tracks })
    expect(input.title).toBe('Night Drive')
    expect(input.trackTitles).toEqual(['Neon'])
    expect(input.tracks?.[0]?.title).toBe('Neon')
    expect(input.year).toBe(2024)
  })

  it('drafts copy and DSP description from catalog press notes, BPM, and credits', () => {
    const input = dnaCopyInputFromCatalog({
      title: 'Are We Awake?',
      type: 'ep',
      genre: 'Dance',
      subgenre: 'House',
      artist: 'SERGIK',
      year: 2026,
      tracks: [
        {
          title: 'It Is What It Is',
          track_number: 1,
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'writer', name: 'SERGIK' },
            { role: 'producer', name: 'SERGIK' },
          ],
          identity: {
            description:
              'It Is What It Is is a funky house cut at 124 BPM in C# major, built for full-time boogie floors.',
            genre: 'Funky House',
            subgenre: 'Boogie',
            bpm: 124,
            key_signature: 'C# major',
            drum_style: 'Breakbeat',
          },
        },
        {
          title: 'Elevator Musik',
          track_number: 2,
          identity: {
            description: 'A tighter late-night roller with hats that ride the bar.',
            genre: 'Funky House',
            subgenre: 'Boogie',
            bpm: 128,
            key_signature: 'A minor',
          },
        },
      ],
    })

    expect(input.genre).toBe('Funky House')
    expect(input.subgenre).toBe('Boogie')
    expect(catalogCopyFacts(input)).toMatchObject({
      trackCount: 2,
      tempo: '124–128 BPM',
      pressNotes: 2,
    })

    const description = releaseDescriptionFromCatalog(input)
    expect(description).toMatch(/two-track EP listen/i)
    expect(description).toMatch(/Funky House \/ Boogie/)
    expect(description).toMatch(/It Is What It Is/)
    expect(description).toMatch(/Elevator Musik/)
    expect(description).not.toMatch(/Groove class|measured usage|crate name/i)

    const generated = marketingCopyFromDna(input)
    expect(generated.elevator_pitch).toMatch(/funky house cut at 124 BPM/)
    expect(generated.press_blurb).toMatch(/Are We Awake\?/)
    expect(generated.press_blurb).toMatch(/Elevator Musik/)
    expect(generated.spotify_pitch).toMatch(/124–128 BPM/)
    expect(generated.spotify_pitch).toMatch(/C# major/)
    expect(generated.store_description).toMatch(/1\. It Is What It Is — 124 BPM/)
    expect(generated.store_description).toMatch(/Funky House \/ Boogie/)
    expect(generated.store_description).toMatch(/Tracklist/)
    expect(generated.store_description).toMatch(/Tags:/)
    expect(generated.store_description).toMatch(/Why press play/)
    expect(generated.social_caption).toMatch(/2-track EP/)
    expect(generated.social_caption).toMatch(/OUT NOW/)
    expect(generated.social_caption).toMatch(/#SERGIK/)
    expect(generated.social_caption).toMatch(/#NewMusic|#OutNow/)
    expect(generated.credits_block).toMatch(/Written by SERGIK/)
  })

  it('builds SEO launch captions with a discovery hashtag block', () => {
    const input = dnaCopyInputFromCatalog({
      title: 'Are We Awake?',
      type: 'ep',
      genre: 'Funky House',
      subgenre: 'Deep n Funky',
      artist: 'SERGIK',
      tracks: [
        {
          title: 'It Is What It Is',
          track_number: 1,
          identity: {
            description: 'A stripped breakbeat that refuses the obvious.',
            bpm: 124,
            genre: 'Funky House',
            drum_style: 'Breakbeat',
          },
        },
        {
          title: 'Elevator Musik',
          track_number: 2,
          identity: { bpm: 127, genre: 'Funky House', drum_style: 'Four-On-The-Floor' },
        },
      ],
    })
    const caption = marketingCopyFromDna(input).social_caption || ''
    expect(caption).toMatch(/^OUT NOW/)
    expect(caption).toMatch(/Stream everywhere/)
    expect(caption).toMatch(/#SERGIK/)
    expect(caption).toMatch(/#FunkyHouse|#Funky|#House/)
    expect(caption).toMatch(/#NewEP|#EPRelease/)
    expect(caption).toMatch(/#NewMusic/)
    expect(caption).toMatch(/#OutNow|#NowPlaying/)
    const tagCount = (caption.match(/#\w+/g) || []).length
    expect(tagCount).toBeGreaterThanOrEqual(8)
  })

  it('folds metadata description, Sonic DNA palette, and artwork into marketing copy', () => {
    const input = dnaCopyInputFromCatalog({
      title: 'UTOPIA',
      type: 'ep',
      genre: 'Dance',
      subgenre: 'House',
      description: '"UTOPIA" is a two-track EP listen — Funky House. Play it in order.',
      artist: 'SERGIK',
      label: 'SERGIK',
      language: 'en',
      streetDate: '2026-10-01',
      artwork_designer: 'Maya Lane',
      artwork_illustrator: 'Nova Ink',
      year: 2026,
      tracks: [
        {
          title: 'Jahdelicah',
          track_number: 1,
          contributors: [
            { role: 'primary', name: 'SERGIK' },
            { role: 'writer', name: 'SERGIK' },
            { role: 'producer', name: 'SERGIK' },
          ],
          identity: {
            description: 'Jahdelicah opens warm and low.',
            genre: 'Funky House',
            subgenre: 'Deep n Funky',
            bpm: 124,
            key_signature: 'A minor',
            drum_style: 'Four-On-The-Floor',
            energy: 4.2,
            instruments: ['bass', 'kick-drum'],
            timing_feel: 'behind',
            intention: 'Hold the floor without crowding it.',
          },
        },
        {
          title: 'Night Drive',
          track_number: 2,
          identity: {
            description: 'Night Drive keeps the lights low.',
            genre: 'Funky House',
            bpm: 126,
            drum_style: 'Breakbeat',
            energy: 3.4,
            instruments: ['keys'],
          },
        },
      ],
    })

    const digest = catalogCopyPromptDigest(input)
    expect(digest).toMatch(/Release metadata/)
    expect(digest).toMatch(/Street date: 2026-10-01/)
    expect(digest).toMatch(/Sonic DNA \+ catalog/)
    expect(digest).toMatch(/Instruments: bass, kick-drum/)
    expect(digest).toMatch(/Intention: Hold the floor/)

    const generated = marketingCopyFromDna(input)
    expect(generated.elevator_pitch).toMatch(/124/)
    expect(generated.spotify_pitch).toMatch(/Grooves:|Palette:/)
    expect(generated.credits_block).toMatch(/Design: Maya Lane/)
    expect(generated.credits_block).toMatch(/Illustration: Nova Ink/)
    expect(generated.credits_block).toMatch(/Label: SERGIK/)
    expect(generated.store_description).toMatch(/UTOPIA/)
  })

  it('writes an EP description as a start-to-finish listening journey', () => {
    const description = releaseDescriptionFromCatalog({
      title: 'Are We Awake?',
      type: 'ep',
      genre: 'Funky House',
      subgenre: 'Deep n Funky',
      artist: 'SERGIK',
      tracks: [
        {
          title: 'It Is What It Is',
          description:
            '"It Is What It Is" arrives stripped and deliberate — a 124 BPM breakbeat that refuses the obvious.',
          intention: 'A track built on what it leaves out.',
          bpm: 124,
          energy: 4.1,
          danceability: 7,
          drum_style: 'Breakbeat',
          key_signature: 'C# major',
        },
        {
          title: 'Elevator Musik',
          description: '"Elevator Musik" doesn\'t announce itself — it arrives sideways.',
          bpm: 127,
          energy: 3.5,
          drum_style: 'Breakbeat',
        },
        {
          title: 'No Stopping',
          description: '"No Stopping" plants its feet and lets the room breathe around it.',
          bpm: 126,
          energy: 3.4,
          drum_style: 'Four-On-The-Floor',
        },
        {
          title: 'What you want',
          description:
            '"OG Coconut – What You Want" arrives with a quiet confidence that earns the room rather than demands it.',
          bpm: 124,
          energy: 4.5,
          drum_style: 'Four-On-The-Floor',
          billed: 'SERGIK x OG Coconut',
        },
        {
          title: 'Whats the Reason',
          description: '"What\'s the Reason" doesn\'t settle — it interrogates.',
          intention: 'A broken groove with a question mark at its center.',
          bpm: 124,
          energy: 3,
          drum_style: 'Breakbeat',
        },
      ],
    })
    expect(description).toMatch(/five-track EP listen/)
    expect(description).toMatch(/Funky House \/ Deep n Funky/)
    expect(description).toMatch(/124–127 BPM/)
    expect(description).toMatch(/It Is What It Is/)
    expect(description).toMatch(/Elevator Musik/)
    expect(description).toMatch(/No Stopping/)
    expect(description).toMatch(/What you want/)
    expect(description).toMatch(/SERGIK x OG Coconut/)
    expect(description).toMatch(/Whats the Reason/)
    expect(description).toMatch(/peak of the listen/)
    expect(description).toMatch(/Play it in order/)
    expect(description).toMatch(/Tracklist/)
    expect(description).toMatch(/1\. It Is What It Is/)
    expect(description).toMatch(/5\. Whats the Reason/)
    expect(description).not.toMatch(/Groove class|measured usage|crate name/i)
    expect(description.length).toBeGreaterThan(280)
  })

  it('appends ordered tracklist, contributor credits, and artwork credits', () => {
    const description = releaseDescriptionFromCatalog(
      dnaCopyInputFromCatalog({
        title: 'Utopi',
        type: 'ep',
        genre: 'Funky House',
        artist: 'SERGIK',
        artwork_designer: 'Maya Lane',
        artwork_photographer: 'Chris Vale',
        artwork_illustrator: 'Nova Ink',
        tracks: [
          {
            title: 'Jahdelicah',
            track_number: 1,
            contributors: [
              { role: 'primary', name: 'SERGIK' },
              { role: 'writer', name: 'SERGIK' },
              { role: 'producer', name: 'SERGIK' },
              { role: 'featured', name: 'OG Coconut' },
            ],
            identity: {
              description: 'Jahdelicah opens the room with a warm low-end push.',
              bpm: 124,
              energy: 4,
            },
          },
          {
            title: 'Night Drive',
            track_number: 2,
            contributors: [
              { role: 'primary', name: 'SERGIK' },
              { role: 'writer', name: 'SERGIK' },
              { role: 'producer', name: 'SERGIK' },
            ],
            identity: {
              description: 'Night Drive keeps the lights low.',
              bpm: 126,
              energy: 3.5,
            },
          },
        ],
      }),
    )
    expect(description).toMatch(/Tracklist/)
    expect(description).toMatch(/1\. Jahdelicah/)
    expect(description).toMatch(/2\. Night Drive/)
    expect(description).toMatch(/Credits/)
    expect(description).toMatch(/Primary artist:/)
    expect(description).toMatch(/Written by SERGIK/)
    expect(description).toMatch(/Artwork/)
    expect(description).toMatch(/Design: Maya Lane/)
    expect(description).toMatch(/Photography: Chris Vale/)
    expect(description).toMatch(/Illustration: Nova Ink/)
  })
})

describe('mergeVaultDistributionMetadata', () => {
  it('nests ISRC/UPC without dropping other metadata', () => {
    const next = mergeVaultDistributionMetadata(
      { catalog_overrides: { genre: 'House' } },
      {
        releaseId: 'rel-1',
        releaseTitle: 'Night Drive',
        status: 'live',
        isrc: 'QZ1234567890',
        upc: '123456789012',
        releaseDate: '2026-09-16T00:00:00.000Z',
      },
    )
    expect(next.catalog_overrides).toEqual({ genre: 'House' })
    const dist = next.distribution as Record<string, unknown>
    expect(dist.isrc).toBe('QZ1234567890')
    expect(dist.upc).toBe('123456789012')
    expect(dist.releaseDate).toBe('2026-09-16')
    expect(dist.releaseId).toBe('rel-1')
  })
})

