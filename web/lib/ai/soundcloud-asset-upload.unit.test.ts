import { describe, expect, it } from 'vitest'
import { uploadSoundCloudAssets, type StagedSoundCloudFiles } from '@/lib/ai/soundcloud-asset-upload'
import { buildSoundCloudUploadPacket } from '@/lib/ai/soundcloud-upload'
import type { DistroKidUploadPage } from '@/lib/ai/distrokid-asset-upload'

const staged: StagedSoundCloudFiles = {
  dir: '/tmp/sergik-sc-test',
  audioPaths: ['/tmp/01-pre-party.mp3'],
  artworkPath: null,
  filled: ['Track 1 file from distribution_tracks.wav_url (4.0MB)'],
  skipped: [],
  errors: [],
}

const packet = buildSoundCloudUploadPacket({
  title: 'Staying A Vibe',
  artist: 'SERGIK',
  type: 'ep',
  tracks: [{ title: 'Pre Party', audio_url: 'https://cdn.example/pre-party.mp3' }],
})

function pageWithCounts(counts: Record<string, number>, calls: string[]): DistroKidUploadPage {
  return {
    setDefaultTimeout() {},
    locator(selector: string) {
      return {
        async count() {
          return counts[selector] ?? 0
        },
        first() {
          return {
            async setInputFiles() {
              calls.push(selector)
            },
          }
        },
        async setInputFiles() {
          calls.push(`direct:${selector}`)
        },
        async waitFor() {},
      }
    },
  } as DistroKidUploadPage
}

describe('soundcloud file attach', () => {
  it('attaches database files on the audio input and returns', async () => {
    const calls: string[] = []
    const result = await uploadSoundCloudAssets(
      pageWithCounts({ 'input[type="file"][accept*="audio"]': 1 }, calls),
      packet,
      staged,
    )
    expect(calls).toEqual(['input[type="file"][accept*="audio"]'])
    expect(result.errors).toEqual([])
    expect(result.filled.some((line) => line.startsWith('Attached 1'))).toBe(true)
  })

  it('returns as soon as the upload page has no file input', async () => {
    const calls: string[] = []
    const started = Date.now()
    const result = await uploadSoundCloudAssets(pageWithCounts({}, calls), packet, staged)
    expect(Date.now() - started).toBeLessThan(6_000)
    expect(calls).toEqual([])
    expect(result.errors[0]).toMatch(/file input was not on the page/)
  })
})
