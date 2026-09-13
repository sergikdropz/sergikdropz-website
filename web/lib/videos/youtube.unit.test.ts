import { describe, expect, it } from 'vitest'
import {
  guessVideoCategory,
  parseYouTubeInput,
  slugifyVideoTitle,
  uniqueVideoSlug,
  videoCategoryLabel,
  youtubeEmbedUrl,
} from '@/lib/videos/youtube'

describe('parseYouTubeInput', () => {
  it('accepts a raw 11-character id', () => {
    expect(parseYouTubeInput('OML1I_V4Dy4')).toEqual({ youtubeId: 'OML1I_V4Dy4' })
  })

  it('extracts ids from watch, short, embed, and shorts urls', () => {
    expect(parseYouTubeInput('https://www.youtube.com/watch?v=OML1I_V4Dy4&t=12s')).toEqual({
      youtubeId: 'OML1I_V4Dy4',
    })
    expect(parseYouTubeInput('https://youtu.be/OML1I_V4Dy4')).toEqual({ youtubeId: 'OML1I_V4Dy4' })
    expect(parseYouTubeInput('https://www.youtube.com/embed/OML1I_V4Dy4')).toEqual({
      youtubeId: 'OML1I_V4Dy4',
    })
    expect(parseYouTubeInput('https://youtube.com/shorts/OML1I_V4Dy4')).toEqual({
      youtubeId: 'OML1I_V4Dy4',
    })
  })

  it('rejects empty or invalid input', () => {
    expect(parseYouTubeInput('')).toEqual({ error: 'Paste a YouTube URL or 11-character video ID' })
    expect(parseYouTubeInput('https://youtube.com/watch?v=nope')).toEqual({
      error: 'Could not find a video ID in that link',
    })
  })
})

describe('video slug and category helpers', () => {
  it('slugifies titles and keeps ids unique', () => {
    expect(slugifyVideoTitle('SERGIK - Utopia (EP Visual)')).toBe('utopia-ep-visual')
    expect(uniqueVideoSlug('Utopia', ['utopia'])).toBe('utopia-2')
  })

  it('guesses categories from titles', () => {
    expect(guessVideoCategory('Cruise Control Visualizer')).toBe('visualizer')
    expect(guessVideoCategory('Sergik x Nood - If You Want To')).toBe('collaboration')
    expect(guessVideoCategory('Live at Form Festival')).toBe('live-performance')
    expect(guessVideoCategory('Electrify')).toBe('music-video')
  })

  it('labels hyphenated categories in full', () => {
    expect(videoCategoryLabel('behind-the-scenes')).toBe('Behind The Scenes')
  })

  it('builds a privacy-friendly embed url', () => {
    expect(youtubeEmbedUrl('OML1I_V4Dy4', true)).toContain('youtube-nocookie.com/embed/OML1I_V4Dy4')
    expect(youtubeEmbedUrl('OML1I_V4Dy4', true)).toContain('autoplay=1')
  })
})
