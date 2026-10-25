import { describe, expect, it } from 'vitest'
import { compareWriteToReread, formatExecutionVerification } from '@/lib/ai/admin-ai-write-verify'

describe('admin ai write verify', () => {
  it('confirms a pitch that the re-read stored', () => {
    const result = compareWriteToReread({
      tool: 'patch_release_marketing_copy',
      payload: { releaseId: 'r1', marketingCopy: { spotify_pitch: 'Night drive through the city.' } },
      reread: { release: { title: 'Night Drive', marketing_copy: { spotify_pitch: 'Night drive through the city.' } } },
    })
    expect(result.matched).toBe(true)
    expect(result.summary).toMatch(/spotify_pitch/)
  })

  it('flags a pitch that did not land', () => {
    const result = compareWriteToReread({
      tool: 'patch_release_marketing_copy',
      payload: { releaseId: 'r1', marketingCopy: { spotify_pitch: 'Night drive through the city.', upc: '012345678905' } },
      reread: { release: { upc: '012345678905', marketing_copy: { spotify_pitch: '' } } },
    })
    expect(result.matched).toBe(false)
    expect(result.summary).toMatch(/spotify_pitch/)
    expect(result.checks.find((check) => check.field === 'upc')?.matched).toBe(true)
  })

  it('requires an ISRC on every re-read track', () => {
    const result = compareWriteToReread({
      tool: 'assign_isrcs',
      payload: { releaseId: 'r1' },
      reread: { tracks: [{ id: 't1', title: 'Night Drive', isrc_full: '' }] },
    })
    expect(result.matched).toBe(false)
    expect(formatExecutionVerification([{ verification: result }])).toMatch(/Night Drive/)
  })
})
