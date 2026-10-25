import { describe, expect, it } from 'vitest'
import {
  catalogPlaybackSource,
  classifyVaultFileAlignment,
  mayAssignTrackFile,
  mediaFileMatchesTrackTitle,
} from '@/lib/audio/catalog-playback-file'

describe('catalogPlaybackSource', () => {
  it('keeps the stream when it is the same song as the catalog file', () => {
    expect(
      catalogPlaybackSource({
        libraryFileUrl: '/api/audio/media/dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.mp3',
        audioFilePath: 'dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.wav',
      }),
    ).toContain('Pumpin.mp3')
  })

  it('uses the catalog file when the library URL was copied from another song', () => {
    expect(
      catalogPlaybackSource({
        libraryFileUrl: '/api/audio/media/dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-All-Around.wav',
        audioFilePath: 'unreleased/Playlists/Funktioneers/SERGIK x Breauxx - Walk Dat Walk2.wav',
      }),
    ).toContain('Walk Dat Walk2.wav')
  })
})

describe('mediaFileMatchesTrackTitle', () => {
  it('matches a song to its own master and not to a neighbor in the same release', () => {
    const allAround = 'dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-All-Around.wav'
    expect(mediaFileMatchesTrackTitle(allAround, 'All Around')).toBe(true)
    expect(mediaFileMatchesTrackTitle(allAround, 'Walk Dat Walk')).toBe(false)
    expect(mediaFileMatchesTrackTitle(allAround, 'Come Correct')).toBe(false)
    expect(mediaFileMatchesTrackTitle(allAround, 'Move Me /Dance With Me 2')).toBe(false)
    expect(mediaFileMatchesTrackTitle('SERGIK x Breauxx - Walk Dat Walk2.wav', 'Walk Dat Walk')).toBe(true)
    expect(mediaFileMatchesTrackTitle('SERGIK - More Than Life.wav', 'Life')).toBe(false)
    expect(mediaFileMatchesTrackTitle('SERGIK - Life.wav', 'Life')).toBe(true)
    expect(mediaFileMatchesTrackTitle('QZHN92462132-HowYa.wav', 'How Ya')).toBe(true)
  })
})

describe('classifyVaultFileAlignment', () => {
  it('replaces a copied neighbor and keeps a master that names the song', () => {
    const copied = classifyVaultFileAlignment({
      title: 'Walk Dat Walk',
      libraryFileUrl: '/api/audio/media/dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-All-Around.wav',
      audioFilePath: 'unreleased/Playlists/Funktioneers/SERGIK x Breauxx - Walk Dat Walk2.wav',
    })
    expect(copied.action).toBe('replace')
    expect(copied.nextSource).toContain('Walk Dat Walk2')

    const same = classifyVaultFileAlignment({
      title: 'Pumpin',
      libraryFileUrl: '/api/audio/media/dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.mp3',
      audioFilePath: 'dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.wav',
    })
    expect(same.action).toBe('keep')

    const wording = classifyVaultFileAlignment({
      title: 'Make A Wish',
      libraryFileUrl: 'unreleased/SERGIK x Sean Watson x BeJanis - Make A Wish.wav',
      audioFilePath: 'unreleased/SERGIK x Sean Watson x BeJanis - Make A Wish.wav',
    })
    expect(wording.action).toBe('keep')
  })
})

describe('mayAssignTrackFile', () => {
  it('refuses to store another song on a track that already has a file', () => {
    expect(
      mayAssignTrackFile({
        trackTitle: 'Walk Dat Walk',
        currentUrl: 'unreleased/Playlists/Funktioneers/SERGIK x Breauxx - Walk Dat Walk2.wav',
        nextUrl: '/api/audio/media/dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-All-Around.wav',
      }),
    ).toBe(false)
    expect(
      mayAssignTrackFile({
        trackTitle: 'Pumpin',
        currentUrl: 'dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.wav',
        nextUrl: 'dsp-masters/walk-that-walk/SERGIK-x-Breauxxx-Pumpin.mp3',
      }),
    ).toBe(true)
  })
})
