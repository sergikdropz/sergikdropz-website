import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  COVER_MASTER_MAX_PX,
  normalizeCoverArtworkBuffer,
} from '@/lib/media/normalize-cover'

/** Minimal valid 2×2 PNG (red). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6nAAAAAElFTkSuQmCC',
  'base64',
)

describe('normalizeCoverArtworkBuffer', () => {
  it('re-encodes a PNG to a JPEG master', async () => {
    const out = await normalizeCoverArtworkBuffer(TINY_PNG)
    expect(out.ext).toBe('jpg')
    expect(out.mimeType).toBe('image/jpeg')
    expect(out.buffer.length).toBeGreaterThan(20)
    expect(out.buffer[0]).toBe(0xff)
    expect(out.buffer[1]).toBe(0xd8)
    expect(out.width).toBeLessThanOrEqual(COVER_MASTER_MAX_PX)
    expect(out.height).toBeLessThanOrEqual(COVER_MASTER_MAX_PX)
  })

  it('rejects empty buffers', async () => {
    await expect(normalizeCoverArtworkBuffer(Buffer.alloc(0))).rejects.toThrow(/empty/i)
  })

  it('shrinks a large on-disk cover when present', async () => {
    const sample = join(
      process.cwd(),
      'public/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg',
    )
    let input: Buffer
    try {
      input = readFileSync(sample)
    } catch {
      return // artwork not checked out in this environment
    }
    if (input.length < 50_000) return
    const out = await normalizeCoverArtworkBuffer(input)
    expect(out.ext).toBe('jpg')
    expect(out.width).toBeLessThanOrEqual(COVER_MASTER_MAX_PX)
    expect(out.buffer[0]).toBe(0xff)
    expect(out.buffer[1]).toBe(0xd8)
  })
})
