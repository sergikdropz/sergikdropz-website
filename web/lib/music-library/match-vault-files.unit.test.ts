import { describe, expect, it } from 'vitest'
import {
  dropBasename,
  dropVaultRelativeHint,
  matchDropsToVault,
  scoreVaultMatch,
} from '@/lib/music-library/match-vault-files'

describe('match-vault-files', () => {
  const candidates = [
    {
      id: 't1',
      title: 'Happy Camper',
      file_path: 'unreleased/Playlists/Happy Camper/SERGIK - Happy Camper.mp3',
      file_name: 'SERGIK - Happy Camper.mp3',
      file_url: '/audio/unreleased/Playlists/Happy%20Camper/SERGIK%20-%20Happy%20Camper.mp3',
    },
    {
      id: 't2',
      title: 'FTP',
      file_path: 'unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
      file_name: 'SERGIK - FTP.mp3',
      file_url: '/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
    },
  ]

  it('extracts basename and vault-relative hints', () => {
    expect(dropBasename({ name: 'SERGIK - FTP.mp3' })).toBe('SERGIK - FTP.mp3')
    expect(
      dropVaultRelativeHint({
        name: 'SERGIK - FTP.mp3',
        path: '/Users/x/web/public/audio/unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
      }),
    ).toBe('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')
  })

  it('scores exact path matches highest', () => {
    const score = scoreVaultMatch(candidates[1], {
      name: 'SERGIK - FTP.mp3',
      path: 'unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
    })
    expect(score).toBeGreaterThanOrEqual(95)
  })

  it('matches drops uniquely into playlist candidates', () => {
    const results = matchDropsToVault(
      [
        { name: 'SERGIK - Happy Camper.mp3' },
        { name: 'SERGIK - FTP.mp3' },
        { name: 'readme.txt' },
      ],
      candidates,
    )
    expect(results[0].trackId).toBe('t1')
    expect(results[1].trackId).toBe('t2')
    expect(results[2].reason).toBe('not_audio')
  })
})
