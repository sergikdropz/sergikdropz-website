import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const presign = vi.fn()
const publicUrl = vi.fn()
const getCfg = vi.fn()
const objectExists = vi.fn()

vi.mock('@/lib/audio/r2Media', () => ({
  getR2MediaConfig: () => getCfg(),
  publicR2MediaUrl: (rel: string) => publicUrl(rel),
  presignR2ObjectUrl: (rel: string, expiresIn?: number) => presign(rel, expiresIn),
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

  it('presigns a vault track for 2 hours when R2 is configured', async () => {
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toEqual({
      url: SIGNED,
      fallbackUrl: PROXY,
      source: 'presigned',
      expiresIn: 2 * 60 * 60,
    })
    expect(presign).toHaveBeenCalledWith(FTP, 2 * 60 * 60)
  })

  it('presigns a sold track for 6 hours', async () => {
    const sold = 'shop/SERGIK - FTP.mp3'
    objectExists.mockResolvedValue(true)
    const out = await resolveVaultPlaybackUrl(sold)
    expect(out?.source).toBe('presigned')
    expect(out?.expiresIn).toBe(6 * 60 * 60)
    expect(presign).toHaveBeenCalledWith(sold, 6 * 60 * 60)
  })

  it('falls back to the proxy in dev if presign fails', async () => {
    presign.mockResolvedValue(null)
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toEqual({ url: PROXY, fallbackUrl: PROXY, source: 'proxy' })
  })

  it('returns null in production when R2 has no object', async () => {
    const env = process.env as Record<string, string | undefined>
    const prevEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    objectExists.mockResolvedValue(false)
    presign.mockClear()
    const out = await resolveVaultPlaybackUrl(FTP)
    expect(out).toBeNull()
    expect(presign).not.toHaveBeenCalled()
    env.NODE_ENV = prevEnv
  })
})
