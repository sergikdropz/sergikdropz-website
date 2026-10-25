import { describe, expect, it } from 'vitest'
import { decideJobAttach, analysisRowComplete, ANALYZER_VERSION } from './analysis-job'
import { isVaultPlaybackPath, playbackPresignSeconds, signedUrlExpired, signedUrlShouldRefresh, SOLD_PRESIGN_SEC, VAULT_PRESIGN_SEC } from './playback-grant'

describe('playback grant', () => {
  it('keeps unreleased vault URLs to a session and sold files longer', () => {
    expect(isVaultPlaybackPath('unreleased/eps/a.mp3')).toBe(true)
    expect(playbackPresignSeconds('/audio/unreleased/eps/a.mp3')).toBe(VAULT_PRESIGN_SEC)
    expect(VAULT_PRESIGN_SEC).toBe(2 * 60 * 60)
    expect(playbackPresignSeconds('shop/a.mp3')).toBe(SOLD_PRESIGN_SEC)
  })

  it('refreshes a signature inside the last five minutes and keeps a fresh one', () => {
    const start = Date.UTC(2026, 9, 11, 13, 0, 0)
    const fresh = `https://example.r2.cloudflarestorage.com/audio/a.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261011T130000Z&X-Amz-Expires=${2 * 60 * 60}&X-Amz-Signature=abc`
    const closing = `https://example.r2.cloudflarestorage.com/audio/a.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261011T130000Z&X-Amz-Expires=600&X-Amz-Signature=abc`
    const now = start + 60 * 1000
    expect(signedUrlShouldRefresh(fresh, now)).toBe(false)
    expect(signedUrlExpired(fresh, now)).toBe(false)
    expect(signedUrlShouldRefresh(closing, start + 6 * 60 * 1000)).toBe(true)
    expect(signedUrlExpired(closing, start + 11 * 60 * 1000)).toBe(true)
  })
})

describe('analysis job attach', () => {
  it('inserts when nothing is queued', () => {
    expect(decideJobAttach(null)).toBe('insert')
  })

  it('attaches to the open job', () => {
    expect(decideJobAttach({ status: 'pending', attempts: 0, max_attempts: 3 })).toBe('attach')
    expect(decideJobAttach({ status: 'running', attempts: 1, max_attempts: 3 })).toBe('attach')
  })

  it('requeues a failure under the cap and stops at three', () => {
    expect(decideJobAttach({ status: 'failed', attempts: 2, max_attempts: 3 })).toBe('requeue')
    expect(decideJobAttach({ status: 'failed', attempts: 3, max_attempts: 3 })).toBe('exhausted')
  })

  it('treats a finished row as complete only for this analyzer version', () => {
    expect(
      analysisRowComplete({
        file_hash: 'abc',
        analyzer_version: ANALYZER_VERSION,
        waveform_json_url: 'https://cdn/wave.json',
        bpm: 120,
        sonic_dna: { ok: true },
        sonic_dna_status: 'completed',
      }),
    ).toBe(true)
    expect(
      analysisRowComplete({
        file_hash: 'abc',
        analyzer_version: 'old',
        waveform_json_url: 'https://cdn/wave.json',
        bpm: 120,
        sonic_dna: { ok: true },
        sonic_dna_status: 'completed',
      }),
    ).toBe(false)
  })
})
