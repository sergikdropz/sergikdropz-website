import { describe, expect, it } from 'vitest'
import { prefillSoundCloudPage } from '@/lib/ai/soundcloud-prefill'
import {
  buildSoundCloudUploadPacket,
  isDatabaseMediaReference,
  messageWantsSoundCloudUpload,
  pickDatabaseAudioUrl,
  soundcloudUploadAgentPayload,
} from '@/lib/ai/soundcloud-upload'

describe('soundcloud database files', () => {
  it('uses the distribution wav_url before library and audio_files rows', () => {
    expect(
      pickDatabaseAudioUrl({
        wavUrl: 'https://cdn.example/audio-files/dsp-masters/staying-a-vibe/pre-party.mp3',
        libraryFileUrl: 'https://cdn.example/library/pre-party.mp3',
        audioFileUrl: 'https://cdn.example/audio/pre-party.mp3',
      }),
    ).toEqual({
      url: 'https://cdn.example/audio-files/dsp-masters/staying-a-vibe/pre-party.mp3',
      source: 'distribution_tracks.wav_url',
    })
  })

  it('falls through to the library file, then audio_files, and ignores a local path', () => {
    expect(
      pickDatabaseAudioUrl({
        wavUrl: '/Users/machd/Music/Pre Party.wav',
        libraryFileUrl: 'unreleased/eps/staying-a-vibe/pre-party.mp3',
      })?.source,
    ).toBe('music_library_tracks.file_url')
    expect(
      pickDatabaseAudioUrl({
        wavUrl: '',
        audioFileUrl: 'https://cdn.example/storage/pre-party.wav',
      })?.source,
    ).toBe('audio_files.file_url')
    expect(isDatabaseMediaReference('/Users/machd/Music/track.wav')).toBe(false)
    expect(isDatabaseMediaReference('file:///tmp/track.wav')).toBe(false)
  })

  it('builds an EP packet only from database file URLs', () => {
    const packet = buildSoundCloudUploadPacket({
      title: 'Staying A Vibe',
      artist: 'SERGIK',
      type: 'ep',
      genre: 'Dance',
      subgenre: 'Soulful House',
      description: 'Late-night house.',
      artwork_url: 'https://cdn.example/artwork/staying-a-vibe.jpg',
      tracks: [
        {
          track_number: 2,
          title: 'Tequila Power',
          audio_url: 'https://cdn.example/tequila.mp3',
          audio_source: 'distribution_tracks.wav_url',
        },
        {
          track_number: 1,
          title: 'Pre Party',
          audio_url: '/Users/machd/Music/pre-party.wav',
        },
      ],
    })
    expect(packet.playlist_type).toBe('ep')
    expect(packet.genre).toBe('Deep House')
    expect(packet.tracks[0]?.title).toBe('Pre Party')
    expect(packet.tracks[0]?.audio_url).toBe('')
    expect(packet.ok).toBe(false)
    expect(packet.blockers.some((line) => /Pre Party/.test(line) && /database/.test(line))).toBe(true)
    expect(packet.tracks[1]?.audio_url).toContain('tequila.mp3')
    expect(packet.artwork_url).toContain('staying-a-vibe.jpg')
  })

  it('recognizes an upload request for the open release', () => {
    expect(messageWantsSoundCloudUpload('upload staying a vibe ep in to soundcloud')).toBe(true)
    expect(messageWantsSoundCloudUpload('how many soundcloud plays')).toBe(false)
    expect(soundcloudUploadAgentPayload('upload staying a vibe ep in to soundcloud', 'rel-1')).toEqual({
      action: 'soundcloud_prefill',
      releaseId: 'rel-1',
    })
  })
})

describe('soundcloud prefill guard', () => {
  it('refuses to run off the upload page', async () => {
    const result = await prefillSoundCloudPage(
      {
        url: () => 'https://soundcloud.com/sergikdropz',
        evaluate: async () => ({ filled: [], skipped: [], errors: [] }),
      },
      buildSoundCloudUploadPacket({
        title: 'Staying A Vibe',
        type: 'ep',
        artwork_url: 'https://cdn.example/art.jpg',
        tracks: [{ title: 'Pre Party', audio_url: 'https://cdn.example/pre-party.mp3' }],
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/soundcloud\.com\/upload/)
  })
})
