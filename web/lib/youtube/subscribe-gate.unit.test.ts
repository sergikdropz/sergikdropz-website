import { describe, expect, it } from 'vitest'
import { readYtSubGate, sealYtSubGate } from '@/lib/youtube/subscribe-gate'

describe('youtube subscribe gate cookie', () => {
  it('seals a token that reads back as unlocked', () => {
    const { token, maxAgeSec } = sealYtSubGate()
    expect(maxAgeSec).toBeGreaterThan(0)
    expect(readYtSubGate(token)).toBe(true)
  })

  it('rejects a tampered token and an expired one', () => {
    const { token } = sealYtSubGate()
    expect(readYtSubGate(`${token}x`)).toBe(false)
    const expired = sealYtSubGate(Date.now() - 40 * 24 * 60 * 60 * 1000)
    expect(readYtSubGate(expired.token)).toBe(false)
  })
})
