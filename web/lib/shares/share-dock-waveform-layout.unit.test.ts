import { describe, expect, it } from 'vitest'
import {
  SHARE_DOCK_WAVEFORM_HEIGHT_PX,
  SHARE_DOCK_WAVEFORM_HEIGHT_PX_SM,
  shareWaveformLayoutChanged,
  targetBarCount,
} from '@/lib/shares/share-dock-waveform-layout'

describe('share dock waveform layout', () => {
  it('ignores sub-pixel height jitter', () => {
    expect(shareWaveformLayoutChanged(360, 44, 360, 45)).toBe(false)
    expect(shareWaveformLayoutChanged(360, 44, 362, 44)).toBe(true)
    expect(shareWaveformLayoutChanged(360, 44, 360, 47)).toBe(true)
  })

  it('targets stable bar counts for common mobile widths', () => {
    expect(targetBarCount(360)).toBe(144)
    expect(targetBarCount(390)).toBe(156)
  })

  it('locks waveform row heights for mobile and sm breakpoints', () => {
    expect(SHARE_DOCK_WAVEFORM_HEIGHT_PX).toBe(44)
    expect(SHARE_DOCK_WAVEFORM_HEIGHT_PX_SM).toBe(48)
  })
})
