import { describe, expect, it } from 'vitest'
import {
  alternateVaultRelativePaths,
  vaultAssetPathsMatch,
  vaultRelativePathCandidates,
} from './vault-audio-extensions'

describe('alternateVaultRelativePaths', () => {
  it('offers m4a when catalog points at mp3', () => {
    expect(alternateVaultRelativePaths('unreleased/Playlists/Feelin Sendy/SERGIK - Bender.mp3')).toEqual([
      'unreleased/Playlists/Feelin Sendy/SERGIK - Bender.m4a',
      'unreleased/Playlists/Feelin Sendy/SERGIK - Bender.wav',
      'unreleased/Playlists/Feelin Sendy/SERGIK - Bender.aac',
    ])
  })

  it('offers mp3 when source is m4a', () => {
    const alts = alternateVaultRelativePaths('unreleased/a.m4a')
    expect(alts[0]).toBe('unreleased/a.mp3')
  })

  it('lists the requested path first in candidates', () => {
    expect(vaultRelativePathCandidates('unreleased/a.mp3')[0]).toBe('unreleased/a.mp3')
    expect(vaultRelativePathCandidates('unreleased/a.mp3')).toContain('unreleased/a.m4a')
  })

  it('treats mp3 and m4a as the same asset', () => {
    expect(vaultAssetPathsMatch('unreleased/a.mp3', 'unreleased/a.m4a')).toBe(true)
  })
})
