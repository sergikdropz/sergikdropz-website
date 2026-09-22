import { describe, expect, it } from 'vitest'
import { isMp4Blob, withMp4Filename } from './ensure-mp4'

describe('ensure-mp4 helpers', () => {
  it('detects mp4 mime types', () => {
    expect(isMp4Blob(new Blob([], { type: 'video/mp4' }))).toBe(true)
    expect(isMp4Blob(new Blob([], { type: '' }), 'video/mp4')).toBe(true)
    expect(isMp4Blob(new Blob([], { type: 'video/webm' }))).toBe(false)
  })

  it('rewrites filenames to .mp4', () => {
    expect(withMp4Filename('SERGIK-FTP-story.webm')).toBe('SERGIK-FTP-story.mp4')
    expect(withMp4Filename('clip.mp4')).toBe('clip.mp4')
    expect(withMp4Filename('')).toBe('story.mp4')
  })
})
