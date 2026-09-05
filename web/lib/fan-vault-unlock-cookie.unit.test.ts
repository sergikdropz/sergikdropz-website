import { describe, expect, it } from 'vitest'
import { readFanVaultUnlockToken, sealFanVaultUnlock } from '@/lib/fan-vault-unlock-cookie'

describe('fan vault unlock cookie', () => {
  it('round-trips a raw email token', () => {
    const { token } = sealFanVaultUnlock('SerikDrops@gmail.com')
    expect(token.startsWith('serikdrops@gmail.com.')).toBe(true)
    expect(readFanVaultUnlockToken(token)).toBe('serikdrops@gmail.com')
  })

  it('accepts cookie-layer double encoding of @', () => {
    const { token } = sealFanVaultUnlock('fan@example.com')
    const doubled = token.replace('fan@example.com', 'fan%2540example.com')
    expect(readFanVaultUnlockToken(doubled)).toBe('fan@example.com')
  })
})
