import { describe, expect, it } from 'vitest'
import { lockSharePlayback, shareFileIsUnreleased, shareNeedsListenUnlock } from './share-listen-gate'
import type { ResolvedSharePayload } from './types'

function input(overrides: {
  visibility?: 'public' | 'unlisted' | 'disabled'
  hidden?: boolean
  files?: string[]
}) {
  return {
    share: { visibility: overrides.visibility || 'public' },
    collection: overrides.hidden == null ? null : { hidden: overrides.hidden },
    tracks: (overrides.files || ['/audio/released/eps/a.mp3']).map((file) => ({ file })),
  }
}

describe('share listen unlock gate', () => {
  it('treats unreleased catalog paths as locked music', () => {
    expect(shareFileIsUnreleased('/audio/unreleased/eps/SERGIK%20-%20FTP/a.mp3')).toBe(true)
    expect(shareFileIsUnreleased('/api/audio/media/unreleased/Library/a.mp3?x=1')).toBe(true)
    expect(shareFileIsUnreleased('/audio/released/eps/a.mp3')).toBe(false)
  })

  it('requires unlock for unlisted, hidden, or unreleased shares', () => {
    expect(shareNeedsListenUnlock(input({ visibility: 'unlisted' }))).toBe(true)
    expect(shareNeedsListenUnlock(input({ hidden: true }))).toBe(true)
    expect(
      shareNeedsListenUnlock(input({ files: ['/audio/unreleased/eps/Inspire/Da Pyramids.mp3'] })),
    ).toBe(true)
    expect(shareNeedsListenUnlock(input({}))).toBe(false)
  })

  it('strips playable files while the share stays locked', () => {
    const payload = {
      share: { token: 't', kind: 'folder', visibility: 'unlisted', title: 'Inspire' },
      collection: null,
      tracks: [{ id: '1', title: 'A', artist: 'SERGIK', duration: 1, file: '/audio/unreleased/a.mp3', playbackUrl: 'https://cdn/a.mp3' }],
      urls: { listen: '/s/t', embed: '/embed/t', embedHtml: '' },
    } as ResolvedSharePayload
    const locked = lockSharePlayback(payload)
    expect(locked.listenLocked).toBe(true)
    expect(locked.tracks[0]?.file).toBe('')
    expect(locked.tracks[0]?.playbackUrl).toBeNull()
    expect(locked.share.title).toBe('Inspire')
  })
})
