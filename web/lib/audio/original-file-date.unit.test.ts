import { describe, expect, it } from 'vitest'
import {
  originalDateFromClientLastModified,
  originalDateFromEmbeddedTags,
  parseTagDateToIso,
  vaultRelativePathFromFileUrl,
} from './original-file-date'

describe('original-file-date', () => {
  it('parses tag date strings', () => {
    expect(parseTagDateToIso('2024')).toBe('2024-01-01')
    expect(parseTagDateToIso('2024-08-25')).toBe('2024-08-25')
    expect(parseTagDateToIso('2024-08')).toBe('2024-08-01')
  })

  it('prefers originaldate from embedded tags', () => {
    const d = originalDateFromEmbeddedTags({
      originaldate: '2023-11-02',
      date: '2024-01-01',
      year: 2020,
    })
    expect(d?.isoDate).toBe('2023-11-02')
    expect(d?.year).toBe(2023)
    expect(d?.source).toBe('embedded_tag')
  })

  it('uses client lastModified as export date', () => {
    const local = new Date(2025, 3, 26) // Apr 26 local — avoids UTC day shift
    const d = originalDateFromClientLastModified(local.getTime())
    expect(d?.year).toBe(2025)
    expect(d?.isoDate).toBe('2025-04-26')
    expect(d?.source).toBe('client_last_modified')
  })

  it('extracts vault relative path from public audio urls', () => {
    expect(vaultRelativePathFromFileUrl('/audio/unreleased/Playlists/A/x.mp3')).toBe(
      'unreleased/Playlists/A/x.mp3',
    )
    expect(vaultRelativePathFromFileUrl('https://example.com/audio/foo/bar.wav')).toBe('foo/bar.wav')
    expect(vaultRelativePathFromFileUrl('/other/path.mp3')).toBeNull()
  })
})
