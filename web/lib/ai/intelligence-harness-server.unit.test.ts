import { describe, expect, it, vi, afterEach } from 'vitest'
import { runIntelligenceHarness } from '@/lib/ai/intelligence-harness-server'

describe('runIntelligenceHarness', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns stack connectivity when OlliN API is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Connection refused')
      }),
    )

    const out = await runIntelligenceHarness({ mode: 'stack', query: 'test' })
    expect(out.mode).toBe('stack')
    expect(out.connectivity?.ollinProApi).toBe(false)
    expect(String(out.connectivity?.summary)).toMatch(/offline/i)
  })
})
