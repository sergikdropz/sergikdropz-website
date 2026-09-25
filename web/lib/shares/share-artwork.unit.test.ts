import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { statSync } from 'fs'

vi.mock('fs', () => ({
  statSync: vi.fn(),
}))

const STORAGE =
  'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-1790233725753.jpg?v=1790260201040'

describe('resolveShareArtworkUrl', () => {
  const env = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...env }
    delete process.env.NEXT_PUBLIC_LOCAL_AUDIO
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://bjzevrsruixsbypybyiy.supabase.co'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://sergikdropz.com'
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 1_700_000_000_000 } as ReturnType<typeof statSync>)
  })

  afterEach(() => {
    process.env = env
    vi.clearAllMocks()
  })

  it('keeps Supabase storage URLs on live deploys (not stale /images on Vercel)', async () => {
    const { resolveShareArtworkUrl } = await import('./share-artwork')
    expect(resolveShareArtworkUrl(STORAGE)).toBe(STORAGE)
  })

  it('maps local folder paths to Storage on live deploys', async () => {
    const { resolveShareArtworkUrl } = await import('./share-artwork')
    expect(
      resolveShareArtworkUrl(
        'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-1790233725753.jpg?v=9',
      ),
    ).toBe(STORAGE.replace('1790260201040', '9'))
    expect(
      resolveShareArtworkUrl('/images/audio/artwork/folder-1790233725753.jpg?v=9'),
    ).toBe(
      'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-1790233725753.jpg?v=9',
    )
  })

  it('uses local masters with mtime bust in localhost dev', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3001'
    const { resolveShareArtworkUrl } = await import('./share-artwork')
    const url = resolveShareArtworkUrl(
      'https://bjzevrsruixsbypybyiy.supabase.co/storage/v1/object/public/audio-files/artwork/folder-1790233725753.jpg',
    )
    expect(url).toBe('/images/audio/artwork/folder-1790233725753.jpg?v=1700000000')
  })

  it('keeps remote non-folder artwork unchanged', async () => {
    const { resolveShareArtworkUrl } = await import('./share-artwork')
    const remote = 'https://cdn.example.com/custom-track-cover.jpg'
    expect(resolveShareArtworkUrl(remote)).toBe(remote)
  })
})
