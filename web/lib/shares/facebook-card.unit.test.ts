import { describe, expect, it } from 'vitest'
import {
  facebookCardObjectPath,
  facebookCardPublicUrl,
  SHARE_CARD_VERSION,
  shareClock,
} from './facebook-card'

describe('facebook card', () => {
  it('formats track lengths the way the listen page does', () => {
    expect(shareClock(276)).toBe('4:36')
    expect(shareClock(0)).toBe('')
  })

  it('builds a public mp4 path Facebook can fetch', () => {
    expect(facebookCardObjectPath('tok_1')).toBe(`facebook-cards/tok_1-${SHARE_CARD_VERSION}.mp4`)
    expect(facebookCardPublicUrl('tok_1', 'https://example.supabase.co')).toBe(
      `https://example.supabase.co/storage/v1/object/public/audio-files/facebook-cards/tok_1-${SHARE_CARD_VERSION}.mp4`,
    )
    expect(facebookCardPublicUrl('tok_1', '')).toBeNull()
  })
})
