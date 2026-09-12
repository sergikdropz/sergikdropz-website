import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const presign = vi.fn()
const publicUrl = vi.fn()
const getCfg = vi.fn()
const objectExists = vi.fn()

vi.mock('@/lib/audio/r2Media', () => ({
  getR2MediaConfig: () => getCfg(),
  publicR2MediaUrl: (rel: string) => publicUrl(rel),
  presignR2ObjectUrl: (rel: string) => presign(rel),
  r2ObjectExists: (rel: string) => objectExists(rel),
}))

import { resolveVaultPlaybackUrl } from './resolve-vault-playback-url'
import { clearVaultObjectCache } from './vault-object-resolver'

const FTP = 'unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3'
const PROXY = '/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3'
const SIGNED =
  'https://sergik-vault.e7b3fe976b079a994da8533ba6274a5d.r2.cloudflarestorage.com/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256'

describe('resolveVaultPlaybackUrl', () => {
  const prev = {
    flag: process.env.R2_BROWSER_PLAY,
    publicFlag: process.env.NEXT_PUBLIC_R2_BROWSER_PLAY,
  }

  beforeEach(() => {
    clearVaultObjectCache()
    delete process.env.R2_BROWSER_PLAY
    delete process.env.NEXT_PUBLIC_R2_BROWSER_PLAY
    getCfg.mockReturnValue({
      accountId: 'a',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucket: 'sergik-vault',
    })
    publicUrl.mockReturnValue(null)
    presign.mockResolvedValue(SIGNED)
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.mp3'))
  })

  afterEach(() => {
    if (prev.flag == null) delete process.env.R2_BROWSER_PLAY
    else process.env.R2_BROWSER_PLAY = prev.flag
    if (prev.publicFlag == null) delete process.env.NEXT_PUBLIC_R2_BROWSER_PLAY
    else process.env.NEXT_PUBLIC_R2_BROWSER_PLAY = prev.publicFlag
  })

  it('flag off returns same-origin proxy and does not presign', async () => {
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toEqual({ url: PROXY, fallbackUrl: PROXY, source: 'proxy' })
    expect(presign).not.toHaveBeenCalled()
  })

  it('flag on still returns proxy while browser-play is hard-disabled', async () => {
    process.env.R2_BROWSER_PLAY = '1'
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toEqual({ url: PROXY, fallbackUrl: PROXY, source: 'proxy' })
    expect(presign).not.toHaveBeenCalled()
  })

  it('falls back to proxy if presign fails while flag is on', async () => {
    process.env.R2_BROWSER_PLAY = '1'
    presign.mockResolvedValue(null)
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toEqual({ url: PROXY, fallbackUrl: PROXY, source: 'proxy' })
  })
})
