import { describe, expect, it } from 'vitest'
import {
  albumMotionPose,
  albumMotionsPose,
  storyMotionDirectionOptions,
  storyMotionSelection,
  storyMotionSpeedOptions,
  storyPulseClockLabel,
  storyPulseHit,
  storyPulseIntervalSec,
  DEFAULT_STORY_LOOK,
  hexToRgba,
  normalizeStoryLook,
  spectrumBarLevels,
  storyTapeWindow,
  compactWaveformPeaks,
  storyTapePeaksFromBody,
  resolveStoryPaint,
  STORY_AESTHETICS,
  storyAccentHex,
  storyAccentLabel,
  storyLookDetail,
  storyLookLabel,
  storyLookSlug,
} from './story-look'

describe('story look', () => {
  it('defaults to vinyl, midnight, album artwork, violet', () => {
    expect(normalizeStoryLook(undefined)).toEqual(DEFAULT_STORY_LOOK)
    expect(normalizeStoryLook({ subject: 'nope' as 'vinyl' }).subject).toBe('vinyl')
    expect(normalizeStoryLook({ subject: 'background' }).subject).toBe('background')
    expect(storyLookDetail({ subject: 'background' })).toBe(
      'Background · Midnight · Album artwork · Violet'
    )
  })

  it('keeps a valid custom accent and drops a bad one', () => {
    expect(
      storyAccentHex({ accent: 'custom', accentHex: '#FF00AA' })
    ).toBe('#ff00aa')
    expect(normalizeStoryLook({ accent: 'custom', accentHex: 'red' }).accent).toBe('violet')
    expect(storyAccentHex({ accent: 'cyan' })).toBe('#22d3ee')
  })

  it('paints cream as light paper and gives each aesthetic its own ground', () => {
    const cream = resolveStoryPaint({ ...DEFAULT_STORY_LOOK, aesthetic: 'cream', background: 'solid' })
    expect(cream.light).toBe(true)
    expect(cream.bg).toBe('#f3eee4')
    expect(cream.ink).toBe('#1c1917')
    const grounds = STORY_AESTHETICS.map(
      (item) => resolveStoryPaint({ ...DEFAULT_STORY_LOOK, aesthetic: item.id }).bg
    )
    expect(new Set(grounds).size).toBe(grounds.length)
  })

  it('tints the wash with the chosen accent', () => {
    const paint = resolveStoryPaint({ ...DEFAULT_STORY_LOOK, accent: 'rose', background: 'wash' })
    expect(paint.accent).toBe('#fb7185')
    expect(paint.wash).toBe(hexToRgba('#fb7185', 0.62))
    expect(paint.progress).toBe('#fb7185')
  })

  it('names and slugs the selected look', () => {
    expect(storyLookLabel(DEFAULT_STORY_LOOK)).toBe('Vinyl · Midnight')
    expect(storyLookDetail({ subject: 'sleeve', aesthetic: 'gold', background: 'solid', accent: 'amber' })).toBe(
      'Sleeve · Gold · Solid · Amber'
    )
    expect(storyLookSlug({ subject: 'card', aesthetic: 'film', background: 'gradient' })).toBe(
      'card-film-gradient'
    )
  })

  it('uses a sampled cover color and keeps album artwork as a background', () => {
    expect(normalizeStoryLook({ accent: 'artwork', background: 'album' })).toMatchObject({
      accent: 'artwork',
      background: 'album',
    })
    expect(storyAccentHex({ accent: 'artwork', accentHex: '#12ab34' }, '#ff8800')).toBe('#ff8800')
    expect(storyAccentHex({ accent: 'artwork', accentHex: '#12ab34' })).toBe('#12ab34')
    const paint = resolveStoryPaint({ ...DEFAULT_STORY_LOOK, accent: 'artwork', background: 'album' }, '#22aa88')
    expect(paint.background).toBe('album')
    expect(paint.accent).toBe('#22aa88')
    expect(storyLookDetail({ accent: 'artwork', background: 'album' })).toBe(
      'Vinyl · Midnight · Album artwork · Artwork'
    )
  })

  it('keeps pre-save copy and a square frame on the look', () => {
    expect(normalizeStoryLook({ mode: 'presave', frame: 'square' })).toMatchObject({
      mode: 'presave',
      frame: 'square',
    })
    expect(normalizeStoryLook({ mode: 'nope' as 'outnow', frame: 'poster' as 'story' })).toMatchObject({
      mode: 'outnow',
      frame: 'story',
    })
  })

  it('moves the album cover and travels an eight-bar spectrum', () => {
    expect(normalizeStoryLook({ background: 'album', motion: 'drift' }).motion).toBe('drift')
    expect(storyLookSlug({ background: 'album', motion: 'pan' })).toBe('vinyl-midnight-album-pan')
    const still = albumMotionPose('still', 7.5)
    const zoom = albumMotionPose('zoom', 7.5)
    const pan = albumMotionPose('pan', 7.5)
    const rise = albumMotionPose('rise', 7.5)
    const pull = albumMotionPose('pull', 7.5)
    const tilt = albumMotionPose('tilt', 7.5)
    const sweep = albumMotionPose('sweep', 7.5)
    const pulse = albumMotionPose('pulse', 7.5)
    expect(still.scale).toBe(1)
    expect(still.rotate).toBe(0)
    expect(zoom.scale).toBeGreaterThan(still.scale)
    expect(pull.scale).toBeLessThan(zoom.scale)
    expect(Math.abs(pan.tx)).toBeGreaterThan(1)
    expect(Math.abs(rise.ty)).toBeGreaterThan(Math.abs(pan.ty))
    expect(Math.abs(sweep.tx)).toBeGreaterThan(Math.abs(pan.tx))
    expect(pulse.scale).toBeGreaterThan(1)
    expect(pulse.scale).toBeLessThan(zoom.scale)
    expect(Math.abs(tilt.rotate)).toBeGreaterThan(1)
    const reversed = albumMotionPose('pan', 7.5, 15, { motionDirection: 'reverse' })
    expect(reversed.tx).toBeLessThan(0)
    expect(pan.tx).toBeGreaterThan(0)
    const quick = albumMotionPose('pan', 3.75, 15, { motionSpeed: 'fast' })
    const steady = albumMotionPose('pan', 3.75, 15, { motionSpeed: 'steady' })
    expect(Math.abs(quick.tx)).toBeGreaterThan(Math.abs(steady.tx))
    const soft = albumMotionPose('zoom', 7.5, 15, { motionDepth: 'soft' })
    expect(soft.scale).toBeLessThan(zoom.scale)
    expect(storyMotionDirectionOptions('rise').map((item) => item.label)).toEqual(['Up', 'Down'])
    expect(storyMotionDirectionOptions('tilt').map((item) => item.label)).toEqual(['Clockwise', 'Counter'])
    expect(storyMotionSpeedOptions('pulse').map((item) => item.label)).toEqual(['Half', 'Beat', '8ths'])
    const turn = albumMotionPose('turn', 7.5)
    expect(Math.abs(turn.lean || 0)).toBeGreaterThan(0.4)
    const paired = albumMotionsPose('pan', 7.5, 15, undefined, 'rise')
    expect(Math.abs(paired.tx)).toBeGreaterThan(1)
    expect(Math.abs(paired.ty)).toBeGreaterThan(1)
    const leaned = albumMotionsPose('pan', 7.5, 15, undefined, 'turn')
    expect(Math.abs(leaned.tx)).toBeGreaterThan(1)
    expect(Math.abs(leaned.lean || 0)).toBeGreaterThan(0.4)
    expect(normalizeStoryLook({ motion: 'still', motion2: 'turn' }).motion2).toBeUndefined()
    expect(normalizeStoryLook({ motion: 'pan', motion2: 'pan' }).motion2).toBeUndefined()
    expect(normalizeStoryLook({ motion: 'pan', motion2: 'turn' })).toMatchObject({ motion: 'pan', motion2: 'turn' })
    expect(storyMotionSelection({ motion: 'still' }, 'pan')).toEqual({ motion: 'pan', motion2: undefined })
    expect(storyMotionSelection({ motion: 'pan' }, 'turn')).toEqual({ motion: 'pan', motion2: 'turn' })
    expect(storyMotionSelection({ motion: 'pan', motion2: 'turn' }, 'zoom')).toEqual({ motion: 'pan', motion2: 'zoom' })
    expect(storyMotionSelection({ motion: 'pan', motion2: 'turn' }, 'still')).toEqual({
      motion: 'still',
      motion2: undefined,
    })
    expect(storyMotionDirectionOptions('pan', 'sweep').map((item) => item.label)).toEqual(['Right', 'Left'])
    expect(storyMotionDirectionOptions('pan', 'rise').map((item) => item.label)).toEqual(['Forward', 'Reverse'])
    expect(storyMotionSpeedOptions('pulse', 'pan').map((item) => item.label)).toEqual(['Slow', 'Steady', 'Fast'])
    expect(storyLookSlug({ background: 'album', motion: 'pan', motion2: 'turn' })).toBe(
      'vinyl-midnight-album-pan-turn'
    )
    const pairedLook = normalizeStoryLook({
      motion: 'pan',
      motion2: 'rise',
      motionSpeed: 'fast',
      motionDirection: 'forward',
      motion2Speed: 'slow',
      motion2Direction: 'reverse',
      motion2Depth: 'soft',
    })
    expect(pairedLook).toMatchObject({
      motion2Speed: 'slow',
      motion2Direction: 'reverse',
      motion2Depth: 'soft',
    })
    expect(normalizeStoryLook({ motion: 'pan', motion2Speed: 'fast' }).motion2Speed).toBeUndefined()
    const shared = albumMotionsPose('pan', 3.75, 15, { motionSpeed: 'steady', motionDirection: 'forward' }, 'rise', {
      motionSpeed: 'steady',
      motionDirection: 'forward',
    })
    const fastPan = albumMotionsPose('pan', 3.75, 15, { motionSpeed: 'fast', motionDirection: 'forward' }, 'rise', {
      motionSpeed: 'steady',
      motionDirection: 'reverse',
    })
    expect(Math.abs(fastPan.tx)).toBeGreaterThan(Math.abs(shared.tx))
    expect(fastPan.ty).not.toBeCloseTo(shared.ty)
    expect(storyPulseClockLabel(128)).toBe('On the beat · 128 BPM')
    const beat = storyPulseIntervalSec(120, 'steady')
    expect(beat).toBeCloseTo(0.5)
    expect(storyPulseIntervalSec(120, 'fast')).toBeCloseTo(0.25)
    expect(storyPulseHit(0.03, beat)).toBeCloseTo(1, 2)
    expect(storyPulseHit(0.25, beat)).toBeLessThan(0.05)
    const onKick = albumMotionPose('pulse', 0.03, 15, { bpm: 120, motionSpeed: 'steady' })
    const between = albumMotionPose('pulse', 0.25, 15, { bpm: 120, motionSpeed: 'steady' })
    expect(onKick.scale).toBeGreaterThan(between.scale + 0.08)
    const nextKick = albumMotionPose('pulse', 0.53, 15, { bpm: 120, motionSpeed: 'steady' })
    expect(nextKick.scale).toBeCloseTo(onKick.scale, 2)
    const eighth = albumMotionPose('pulse', 0.28, 15, { bpm: 120, motionSpeed: 'fast' })
    expect(eighth.scale).toBeGreaterThan(between.scale + 0.08)
    const quiet = Array.from({ length: 80 }, () => 0.02)
    const loudKick = Array.from({ length: 80 }, (_, i) => (i % 10 < 2 ? 0.95 : 0.04))
    const hats = Array.from({ length: 80 }, (_, i) => (i % 10 >= 4 && i % 10 < 6 ? 0.95 : 0.04))
    const quietPose = albumMotionPose('pulse', 0.03, 15, {
      bpm: 120,
      peaks: quiet,
      trackDurationSec: 4,
    })
    const kickPose = albumMotionPose('pulse', 0.03, 15, {
      bpm: 120,
      peaks: loudKick,
      trackDurationSec: 4,
    })
    const hatPose = albumMotionPose('pulse', 0.03, 15, {
      bpm: 120,
      peaks: hats,
      trackDurationSec: 4,
    })
    expect(kickPose.scale).toBeGreaterThan(quietPose.scale + 0.05)
    expect(kickPose.scale).toBeGreaterThan(hatPose.scale + 0.05)
    const sub = Array.from({ length: 80 }, () => 0.05)
    sub[0] = 1
    sub[1] = 1
    const subPose = albumMotionPose('pulse', 0.03, 15, {
      bpm: 120,
      sub,
      peaks: hats,
      trackDurationSec: 4,
    })
    expect(subPose.scale).toBeGreaterThan(hatPose.scale + 0.05)
    const out = albumMotionPose('pulse', 0.03, 15, { bpm: 120, motionDirection: 'reverse' })
    expect(out.scale).toBeLessThan(1.1)
    expect(onKick.scale).toBeGreaterThan(1.1)
    const start = spectrumBarLevels(0)
    const later = spectrumBarLevels(0.6)
    expect(start).toHaveLength(8)
    expect(start).not.toEqual(later)
    expect(start.every((level) => level > 0 && level <= 1)).toBe(true)
    const early = storyTapeWindow(2, 120, 180)
    const laterWindow = storyTapeWindow(40, 120, 180)
    expect(early.spanSec).toBeCloseTo(16)
    expect(laterWindow.playheadSec - laterWindow.startSec).toBeCloseTo(8)
    expect(early.startSec).not.toBe(laterWindow.startSec)
    expect(compactWaveformPeaks(Array.from({ length: 200 }, (_, i) => (i % 5) / 4), 80)).toHaveLength(80)
    const raw = Array.from({ length: 200 }, (_, i) => (i % 7) / 6)
    expect(storyTapePeaksFromBody(raw)).toHaveLength(200)
    expect(storyTapePeaksFromBody({ waveform_data: raw })).toHaveLength(200)
    expect(normalizeStoryLook({ tape: 'spectrum', tapeGrid: false, tapeGlow: true, tapePlate: 'ink' })).toMatchObject({
      tape: 'spectrum',
      tapeGrid: false,
      tapeGlow: true,
      tapePlate: 'ink',
    })
    expect(normalizeStoryLook({ accent: 'dual', accentHex: '#ff00aa', accentHex2: 'nope' })).toMatchObject({
      accent: 'dual',
      accentHex: '#ff00aa',
      accentHex2: '#22d3ee',
    })
    expect(storyAccentLabel({ accent: 'dual' })).toBe('Dual tone')
    expect(storyAccentLabel({ accent: 'gradient' })).toBe('Artwork gradient')
    expect(normalizeStoryLook({ accent: 'gradient', accentHex: '#112233', accentHex2: '#445566' })).toMatchObject({
      accent: 'gradient',
      accentHex: '#112233',
      accentHex2: '#445566',
    })
    expect(
      resolveStoryPaint({ ...DEFAULT_STORY_LOOK, accent: 'gradient', accentHex: '#112233', accentHex2: '#445566' }).accentEnd
    ).toBe('#445566')
    expect(resolveStoryPaint({ ...DEFAULT_STORY_LOOK, accent: 'dual', accentHex: '#112233', accentHex2: '#445566' })).toMatchObject({
      accent: '#112233',
      accentEnd: '#445566',
    })
    expect(normalizeStoryLook({ tape: 'nope' as 'accent', tapePlate: 'glass' as 'clear' })).toMatchObject({
      tape: 'accent',
      tapePlate: 'clear',
      tapeGrid: true,
      tapeGlow: false,
      tapeOn: true,
    })
    expect(normalizeStoryLook({ tapeOn: false }).tapeOn).toBe(false)
    expect(normalizeStoryLook({}).storesOn).toBe(false)
    expect(normalizeStoryLook({ storesOn: true })).toMatchObject({
      storesOn: true,
      storesPlate: 'solid',
      storesInk: 'auto',
      storesSite: true,
    })
    expect(
      normalizeStoryLook({ storesOn: true, storesPlate: 'clear', storesInk: 'light', storesSite: false })
    ).toMatchObject({
      storesPlate: 'clear',
      storesInk: 'light',
      storesSite: false,
    })
    expect(normalizeStoryLook({ storesPlate: 'glass' as 'solid', storesInk: 'ink' as 'auto' })).toMatchObject({
      storesPlate: 'solid',
      storesInk: 'auto',
    })
  })
})
