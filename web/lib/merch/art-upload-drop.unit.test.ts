import { describe, expect, it } from 'vitest'
import { isMerchArtFile, pickMerchArtFile } from '@/lib/merch/art-upload-drop'

describe('merch art drop', () => {
  it('accepts png and jpeg by mime or extension', () => {
    expect(isMerchArtFile(new File(['x'], 'art.png', { type: '' }))).toBe(true)
    expect(isMerchArtFile(new File(['x'], 'art.webp', { type: 'image/webp' }))).toBe(false)
  })

  it('picks the first valid file from a transfer list', () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    const dt = {
      files: [png],
      items: [],
    } as unknown as DataTransfer
    expect(pickMerchArtFile(dt)?.name).toBe('a.png')
  })
})
