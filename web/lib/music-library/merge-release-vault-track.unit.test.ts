import { describe, expect, it } from 'vitest'
import {
  dedupeTracksPreferringReleaseMasters,
  mergeReleaseOntoVaultTrack,
  pickCanonicalVaultTrack,
  scoreVaultMergeCandidate,
  vaultTitleMatchKey,
} from './merge-release-vault-track'

describe('vaultTitleMatchKey', () => {
  it('normalizes titles and ignores SERGIK artist variants', () => {
    expect(vaultTitleMatchKey('Soul Candy', 'SERGIK')).toBe('soul candy')
    expect(vaultTitleMatchKey('Soul Candy', 'Sergik')).toBe('soul candy')
    expect(vaultTitleMatchKey("Like The Ol' Days")).toBe('like the ol days')
  })
})

describe('pickCanonicalVaultTrack', () => {
  it('prefers vault home over Distrokid Exports stub when both share a title', () => {
    const keep = pickCanonicalVaultTrack([
      {
        id: 'track-dk-1',
        title: 'Soul Candy',
        folder_id: '1789691284218',
        file_url: 'https://cdn.example/distrokid/soul.wav',
        metadata: { source: 'distrokid-wav', isrc: 'QZES72569811' },
      },
      {
        id: 'track-vault-1',
        title: 'Soul Candy',
        folder_id: 'folder-ep-soul',
        file_url: '/audio/vault/soul.mp3',
        bpm: 92,
        key_signature: 'F minor',
        genre: 'Hip-Hop',
      },
    ])
    expect(keep?.id).toBe('track-vault-1')
    expect(scoreVaultMergeCandidate(keep!)).toBeGreaterThan(50)
  })
})

describe('mergeReleaseOntoVaultTrack', () => {
  it('keeps vault catalog fields and adopts the release master file + ISRC', () => {
    const merged = mergeReleaseOntoVaultTrack(
      {
        id: 'track-vault-1',
        file_url: '/audio/vault/soul.mp3',
        artwork_url: '/art/soul.jpg',
        bpm: 92,
        duration: 180,
        date: '2025-02-14',
        metadata: { primary_genre: 'Hip-Hop' },
      },
      {
        file_url: 'https://cdn.example/distrokid/soul.wav',
        audio_file_id: 'audio-dk',
        isrc: 'QZES72569811',
        source: 'distrokid-wav',
      },
    )
    expect(merged.file_url).toContain('/distrokid/')
    expect(merged.audio_file_id).toBe('audio-dk')
    expect(merged.artwork_url).toBe('/art/soul.jpg')
    expect(merged.date).toBe('2025-02-14')
    expect(merged.metadata.isrc).toBe('QZES72569811')
    expect(merged.metadata.primary_genre).toBe('Hip-Hop')
  })
})

describe('dedupeTracksPreferringReleaseMasters', () => {
  it('collapses title twins into one discography row', () => {
    const out = dedupeTracksPreferringReleaseMasters([
      {
        id: 'a',
        title: 'Everyday Gratitude',
        artist: 'SERGIK',
        file: '/audio/a.mp3',
        folderId: 'ep-1',
        bpm: 88,
        key_signature: 'A minor',
      },
      {
        id: 'b',
        title: 'Everyday Gratitude',
        artist: 'Sergik',
        file: 'https://cdn.example/distrokid/everyday.wav',
        folderId: '1789691284218',
        metadata: { source: 'distrokid-wav', isrc: 'QZES72569812' },
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
    expect(String(out[0].file)).toContain('/distrokid/')
    expect(out[0].metadata?.isrc).toBe('QZES72569812')
    expect(out[0].bpm).toBe(88)
  })
})
