import { describe, expect, it } from 'vitest'
import {
  closestEmbroideryThread,
  embroideryVariantOptions,
  matchingEmbroideryThread,
  threadOptionIdForFile,
  threadsFromColorSamples,
  previewStitchThreads,
  quantizeImageData,
  toggleEmbroideryThread,
} from '@/lib/merch/embroidery-threads'

describe('embroidery threads', () => {
  it('maps large front embroidery to Printful’s thread option', () => {
    expect(threadOptionIdForFile('embroidery_front_large')).toBe('thread_colors_front_large')
    expect(threadOptionIdForFile('embroidery_back', ['thread_colors_back', 'thread_colors_left'])).toBe(
      'thread_colors_back',
    )
  })

  it('uses thread_colors for the small front when that is what the product stocks', () => {
    expect(threadOptionIdForFile('embroidery_front', ['thread_colors', 'thread_colors_front_large'])).toBe(
      'thread_colors',
    )
  })

  it('picks the nearest stock thread to the garment', () => {
    expect(closestEmbroideryThread('#111111').hex).toBe('#000000')
    expect(closestEmbroideryThread('#f7f7f7').hex).toBe('#FFFFFF')
    expect(closestEmbroideryThread('#333366').name).toBe('Navy')
  })

  it('matches a named garment color before the nearest hex', () => {
    expect(matchingEmbroideryThread('#1c2438', 'Black').name).toBe('Black')
    expect(matchingEmbroideryThread('#888888', 'Heather Grey').name).toBe('Grey')
  })

  it('sends the chosen thread, and a garment match when nothing was picked', () => {
    expect(
      embroideryVariantOptions(
        ['embroidery_front_large'],
        { embroideryThreads: { thread_colors_front_large: ['#CC3333'] }, previewColor: '#111111' },
        ['thread_colors_front_large'],
      ),
    ).toEqual([{ id: 'thread_colors_front_large', value: ['#CC3333'] }])

    expect(
      embroideryVariantOptions(['embroidery_front_large'], { previewColor: '#111111' }, [
        'thread_colors_front_large',
      ]),
    ).toEqual([{ id: 'thread_colors_front_large', value: ['#000000'] }])
  })

  it('matches every stock color the artwork actually uses', () => {
    const black = Array.from({ length: 50 }, () => ({ r: 0, g: 0, b: 0 }))
    const white = Array.from({ length: 50 }, () => ({ r: 255, g: 255, b: 255 }))
    const fringe = Array.from({ length: 2 }, () => ({ r: 150, g: 150, b: 150 }))
    const matched = threadsFromColorSamples([...black, ...white, ...fringe])
    expect(matched.needsUnlimited).toBe(false)
    expect(matched.threads).toEqual(['#000000', '#FFFFFF'])
  })

  it('asks for unlimited color when the artwork needs more than six threads', () => {
    const palette = [
      [0, 0, 0],
      [255, 255, 255],
      [204, 51, 51],
      [0, 83, 151],
      [255, 204, 0],
      [1, 120, 78],
      [107, 82, 148],
    ]
    const samples = palette.flatMap(([r, g, b]) => Array.from({ length: 20 }, () => ({ r, g, b })))
    const matched = threadsFromColorSamples(samples)
    expect(matched.needsUnlimited).toBe(true)
    expect(matched.threads).toHaveLength(6)
  })

  it('asks for unlimited color when a real color sits outside the stock palette', () => {
    const magenta = Array.from({ length: 40 }, () => ({ r: 255, g: 0, b: 255 }))
    expect(threadsFromColorSamples(magenta).needsUnlimited).toBe(true)
  })

  it('keeps black and white together and will not drop the last color', () => {
    expect(toggleEmbroideryThread(['#000000'], '#FFFFFF')).toEqual(['#000000', '#FFFFFF'])
    expect(toggleEmbroideryThread(['#000000', '#FFFFFF'], '#FFFFFF')).toEqual(['#000000'])
    expect(toggleEmbroideryThread(['#000000'], '#000000')).toEqual(['#000000'])
  })

  it('skips thread colors only on placements that use unlimited color', () => {
    expect(
      embroideryVariantOptions(
        ['embroidery_front_large', 'embroidery_back'],
        { embroideryUnlimitedColor: true, previewColor: '#111111', embroideryThreads: { thread_colors_back: ['#FFFFFF'] } },
        ['thread_colors_front_large', 'thread_colors_back'],
        ['embroidery_front_large'],
      ),
    ).toEqual([{ id: 'thread_colors_back', value: ['#FFFFFF'] }])
  })

  it('maps a preview pixel onto the selected threads and leaves unlimited art alone', () => {
    const pixels = new Uint8ClampedArray([10, 10, 10, 255, 250, 250, 250, 255, 0, 0, 0, 0])
    quantizeImageData(pixels, ['#000000', '#FFFFFF'])
    expect(Array.from(pixels.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(pixels.slice(4, 8))).toEqual([255, 255, 255, 255])
    expect(Array.from(pixels.slice(8))).toEqual([0, 0, 0, 0])
    expect(previewStitchThreads(true, { thread_colors: ['#000000'] })).toBeNull()
    expect(previewStitchThreads(false, { thread_colors: ['#000000', '#FFFFFF'] })).toEqual(['#000000', '#FFFFFF'])
  })
})