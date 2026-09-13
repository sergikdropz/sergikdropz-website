import { describe, expect, it } from 'vitest'
import { redactSecrets } from '@/lib/ai/provider-runtime'

describe('redactSecrets', () => {
  it('redacts openai-style keys and bearer tokens', () => {
    expect(redactSecrets('key sk-abcdefghijklmnopqrstuvwxyz123456')).toContain('[REDACTED_KEY]')
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toContain('[REDACTED_TOKEN]')
  })

  it('redacts key=value secret assignments', () => {
    expect(redactSecrets('api_key=supersecretvalue')).toContain('[REDACTED]')
    expect(redactSecrets('password: hunter2')).toContain('[REDACTED]')
  })
})
