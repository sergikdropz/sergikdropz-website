import { describe, expect, it } from 'vitest'
import {
  firstPlayableTrackIndex,
  mergePlaybackTracks,
  playableAudioUrl,
  releaseHasPlayableAudio,
  stepPlayableTrackIndex,
} from '@/lib/tv/playback'
import type { TvReleaseItem } from '@/lib/tv/catalog'

const release = (id: string, titles: string[]): TvReleaseItem => ({
  id,
  title: id,
  type: 'EP',
  year: 2026,
  image: '',
  tracks: titles.map((title) => ({ title, duration: 120, audioUrl: '' })),
})

describe('playable track order', () => {
  const tracks = [
    { audioUrl: '' },
    { audioUrl: '/api/audio/media/a.mp3' },
    { audioUrl: '' },
    { audioUrl: '/api/audio/media/b.mp3' },
  ]

  it('starts on the first file', () => {
    expect(firstPlayableTrackIndex(tracks)).toBe(1)
    expect(releaseHasPlayableAudio(tracks)).toBe(true)
    expect(releaseHasPlayableAudio([{ audioUrl: '' }])).toBe(false)
  })

  it('wraps to the next and previous file', () => {
    expect(stepPlayableTrackIndex(tracks, 1, 1)).toBe(3)
    expect(stepPlayableTrackIndex(tracks, 3, 1)).toBe(1)
    expect(stepPlayableTrackIndex(tracks, 1, -1)).toBe(3)
    expect(stepPlayableTrackIndex(tracks, 3, -1)).toBe(1)
  })
})

describe('mergePlaybackTracks', () => {
  it('replaces a release track list when files were found', () => {
    const next = mergePlaybackTracks([release('awake', ['Old'])], {
      awake: [{ title: 'It Is What It Is', duration: 234, audioUrl: '/api/audio/media/it.mp3' }],
    })
    expect(next[0]?.tracks).toEqual([
      { title: 'It Is What It Is', duration: 234, audioUrl: '/api/audio/media/it.mp3' },
    ])
  })

  it('keeps the original list when a release has no files', () => {
    const original = [release('static', ['Soul Candy'])]
    expect(mergePlaybackTracks(original, {})).toEqual(original)
  })
})

describe('playableAudioUrl', () => {
  it('keeps same-origin media and drops dead hosts', () => {
    expect(playableAudioUrl('/api/audio/media/unreleased/track.mp3')).toBe('/api/audio/media/unreleased/track.mp3')
    expect(playableAudioUrl('https://storage.local.invalid/audio-files/track.wav')).toBe('')
    expect(playableAudioUrl('javascript:alert(1)')).toBe('')
  })
})
