import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  DSP_COVER_MIN_EDGE,
  DSP_COVER_TARGET_EDGE,
  dspCoverMeetsSpec,
  probeArtworkBuffer,
  renderDspReadyJpeg,
} from '@/lib/studio/artwork-dsp'

async function solidJpeg(size: number, quality = 90): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 40, g: 20, b: 80 },
    },
  })
    .jpeg({ quality })
    .toBuffer()
}

describe('artwork-dsp', () => {
  it('flags covers below 1400px', async () => {
    const buf = await solidJpeg(800)
    const probe = await probeArtworkBuffer(buf)
    expect(probe.ok).toBe(false)
    expect(probe.issues.some((i) => /1400/i.test(i))).toBe(true)
  })

  it('accepts square ≥1400 and rejects non-square as policy note', async () => {
    const square = await probeArtworkBuffer(await solidJpeg(1500))
    expect(square.ok).toBe(true)
    expect(square.width).toBe(1500)

    const rect = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer()
    const rectProbe = await probeArtworkBuffer(rect)
    expect(rectProbe.ok).toBe(true)
    expect(rectProbe.issues.some((i) => /not square/i.test(i))).toBe(true)
  })

  it('renders DSP JPEG capped at 3000px without upscaling past source min edge', async () => {
    const source = await solidJpeg(3200)
    const out = await renderDspReadyJpeg(source)
    expect(out.width).toBe(DSP_COVER_TARGET_EDGE)
    expect(out.height).toBe(DSP_COVER_TARGET_EDGE)
    expect(out.buffer.byteLength).toBeGreaterThan(1000)

    const probe = await probeArtworkBuffer(out.buffer)
    expect(dspCoverMeetsSpec(probe)).toBe(true)
  })

  it('refuses to invent pixels below DSP minimum', async () => {
    const tiny = await solidJpeg(DSP_COVER_MIN_EDGE - 100)
    await expect(renderDspReadyJpeg(tiny)).rejects.toThrow(/below/i)
  })
})
