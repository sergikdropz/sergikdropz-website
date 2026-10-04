import { describe, expect, it } from 'vitest'
import { extractVaultRelativePath } from '@/utils/normalizeVaultAudioUrl'

describe('distrokid asset upload paths', () => {
  it('resolves dsp-master media URLs to vault-relative WAV paths', () => {
    const rel = extractVaultRelativePath(
      '/api/audio/media/dsp-masters/staying-a-vibe/QTA532600006-pre-party.wav?v=1',
      { preferMp3: false }
    )
    expect(rel).toBe('dsp-masters/staying-a-vibe/QTA532600006-pre-party.wav')
  })
})
