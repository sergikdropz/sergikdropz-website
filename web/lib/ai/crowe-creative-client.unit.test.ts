import { describe, expect, it } from 'vitest'
import { sanitizeCroweCreativePayload } from '@/lib/ai/crowe-creative-client'

describe('sanitizeCroweCreativePayload', () => {
  it('strips large base64 fields', () => {
    const huge = 'a'.repeat(500)
    const out = sanitizeCroweCreativePayload({ image_base64: huge, url: 'https://example.com/x.mp4' })
    expect(String(out.image_base64)).toMatch(/omitted/)
    expect(out.url).toBe('https://example.com/x.mp4')
  })
})
