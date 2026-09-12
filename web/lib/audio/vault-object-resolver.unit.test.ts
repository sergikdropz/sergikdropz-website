import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCfg = vi.fn()
const objectExists = vi.fn()

vi.mock('@/lib/audio/r2Media', () => ({
  getR2MediaConfig: () => getCfg(),
  r2ObjectExists: (rel: string) => objectExists(rel),
}))

import {
  clearVaultObjectCache,
  orderedVaultCandidates,
  resolveVaultObjectPath,
} from './vault-object-resolver'

const MP3 = 'unreleased/Playlists/Smoke Break/SERGIK - Smoke Break.mp3'
const WAV = 'unreleased/Playlists/Smoke Break/SERGIK - Smoke Break.wav'

describe('vault-object-resolver', () => {
  beforeEach(() => {
    clearVaultObjectCache()
    objectExists.mockReset()
    getCfg.mockReturnValue({ accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b' })
  })

  it('returns the requested path when it exists', async () => {
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.mp3'))
    expect(await resolveVaultObjectPath(MP3)).toBe(MP3)
  })

  it('finds the sibling extension when the catalog extension is missing', async () => {
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.wav'))
    expect(await resolveVaultObjectPath(MP3)).toBe(WAV)
  })

  it('returns null when no extension exists', async () => {
    objectExists.mockResolvedValue(false)
    expect(await resolveVaultObjectPath(MP3)).toBeNull()
  })

  it('caches the hit so repeat range requests do not re-probe', async () => {
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.wav'))
    await resolveVaultObjectPath(MP3)
    const afterFirst = objectExists.mock.calls.length
    await resolveVaultObjectPath(MP3)
    await resolveVaultObjectPath(MP3)
    expect(objectExists.mock.calls.length).toBe(afterFirst)
  })

  it('dedupes concurrent probes for the same asset', async () => {
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.wav'))
    await Promise.all([
      resolveVaultObjectPath(MP3),
      resolveVaultObjectPath(MP3),
      resolveVaultObjectPath(MP3),
    ])
    // One parallel batch of candidates, not three.
    expect(objectExists.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('passes the path through untouched when R2 is not configured', async () => {
    getCfg.mockReturnValue(null)
    expect(await resolveVaultObjectPath(MP3)).toBe(MP3)
    expect(objectExists).not.toHaveBeenCalled()
  })

  it('orders candidates with the resolved object first', async () => {
    objectExists.mockImplementation(async (rel: string) => rel.endsWith('.wav'))
    const ordered = await orderedVaultCandidates(MP3)
    expect(ordered[0]).toBe(WAV)
    expect(ordered).toContain(MP3)
    expect(new Set(ordered).size).toBe(ordered.length)
  })

  it('still offers every candidate when nothing resolves', async () => {
    objectExists.mockResolvedValue(false)
    const ordered = await orderedVaultCandidates(MP3)
    expect(ordered[0]).toBe(MP3)
    expect(ordered).toContain(WAV)
  })
})
