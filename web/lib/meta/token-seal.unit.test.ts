import { describe, expect, it } from 'vitest'
import { openMetaToken, sealMetaToken } from '@/lib/meta/token-seal'

describe('meta token seal', () => {
  it('round-trips a page token and rejects tampering', () => {
    const sealed = sealMetaToken('page-token-abc')
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('page-token-abc')
    expect(openMetaToken(sealed)).toBe('page-token-abc')
    expect(openMetaToken(`${sealed}x`)).toBeNull()
    expect(openMetaToken('')).toBeNull()
  })
})
