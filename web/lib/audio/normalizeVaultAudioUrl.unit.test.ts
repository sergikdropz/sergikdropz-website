import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  extractVaultRelativePath,
  normalizeVaultAudioUrl,
  vaultUpstreamUrl,
} from '@/utils/normalizeVaultAudioUrl'

describe('normalizeVaultAudioUrl', () => {
  const prev = {
    local: process.env.NEXT_PUBLIC_LOCAL_AUDIO,
    base: process.env.NEXT_PUBLIC_AUDIO_BASE_URL,
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_LOCAL_AUDIO
    delete process.env.NEXT_PUBLIC_AUDIO_BASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_LOCAL_AUDIO = prev.local
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = prev.base
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev.supabase
  })

  it('routes supabase storage URLs through the same-origin media proxy', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://tunnel.trycloudflare.com'
    expect(
      normalizeVaultAudioUrl(
        'https://xyz.supabase.co/storage/v1/object/public/audio-files/unreleased/eps/SERGIK%20-%20Inspire/SERGIK%20-%20The%20McCoy.wav',
      ),
    ).toBe('/api/audio/media/unreleased/eps/SERGIK%20-%20Inspire/SERGIK%20-%20The%20McCoy.mp3')
  })

  it('routes tunnel hosts that still use storage paths through the proxy', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://laundry-soa-isle-courier.trycloudflare.com'
    expect(
      normalizeVaultAudioUrl(
        'https://laundry-soa-isle-courier.trycloudflare.com/storage/v1/object/public/audio-files/unreleased/eps/SERGIK - Inspire/SERGIK - The McCoy.mp3',
      ),
    ).toBe('/api/audio/media/unreleased/eps/SERGIK%20-%20Inspire/SERGIK%20-%20The%20McCoy.mp3')
  })

  it('rewrites absolute /audio URLs on stale hosts to the proxy', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com'
    expect(
      normalizeVaultAudioUrl(
        'https://acrylic-boston-thin-sought.trycloudflare.com/audio/unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
      ),
    ).toBe('/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3')
  })

  it('unwraps nested /audio/https%3A//... mistakes', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com'
    expect(
      normalizeVaultAudioUrl(
        'https://lunisolar.ngrok-free.dev/audio/https%3A//acrylic.trycloudflare.com/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
      ),
    ).toBe('/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3')
  })

  it('never emits a cross-origin playback URL', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://tunnel.ngrok-free.dev'
    for (const input of [
      'https://xyz.supabase.co/storage/v1/object/public/audio-files/unreleased/a.wav',
      'https://tunnel.ngrok-free.dev/audio/unreleased/a.mp3',
      'unreleased/a.mp3',
      '/audio/unreleased/a.mp3',
    ]) {
      expect(normalizeVaultAudioUrl(input).startsWith('/')).toBe(true)
    }
  })

  it('is idempotent — re-normalizing a proxy URL does not nest the prefix', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://tunnel.ngrok-free.dev'
    const once = normalizeVaultAudioUrl('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')
    expect(once).toBe('/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3')
    expect(normalizeVaultAudioUrl(once)).toBe(once)
    expect(normalizeVaultAudioUrl(normalizeVaultAudioUrl(once))).toBe(once)
    expect(extractVaultRelativePath(once)).toBe('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')
  })

  it('is idempotent for local static paths', () => {
    process.env.NEXT_PUBLIC_LOCAL_AUDIO = '1'
    const once = normalizeVaultAudioUrl('unreleased/a.mp3')
    expect(once).toBe('/audio/unreleased/a.mp3')
    expect(normalizeVaultAudioUrl(once)).toBe(once)
  })

  it('extractVaultRelativePath strips host from absolute media URLs', () => {
    expect(
      extractVaultRelativePath(
        'https://acrylic-boston-thin-sought.trycloudflare.com/audio/unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3',
      ),
    ).toBe('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')
  })

  it('leaves non-audio references untouched when AUDIO_BASE is set', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com'
    expect(normalizeVaultAudioUrl('data:audio/mp3;base64,AAAA')).toBe(
      'data:audio/mp3;base64,AAAA',
    )
    expect(normalizeVaultAudioUrl('/images/cover.png')).toBe('/images/cover.png')
    expect(normalizeVaultAudioUrl('blob:https://x/abc')).toBe('blob:https://x/abc')
    expect(extractVaultRelativePath('some-track-title')).toBeNull()
  })

  it('prefers local static files when LOCAL_AUDIO=1', () => {
    process.env.NEXT_PUBLIC_LOCAL_AUDIO = '1'
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com'
    expect(
      normalizeVaultAudioUrl(
        'https://xyz.supabase.co/storage/v1/object/public/audio-files/unreleased/a.mp3',
      ),
    ).toBe('/audio/unreleased/a.mp3')
  })

  it('keeps WAV extension for local vault files (playlist drops)', () => {
    process.env.NEXT_PUBLIC_LOCAL_AUDIO = '1'
    expect(
      normalizeVaultAudioUrl(
        '/audio/unreleased/Playlists/Happy Camper/SERGIK - Innah Peace v2.wav',
      ),
    ).toBe(
      '/audio/unreleased/Playlists/Happy%20Camper/SERGIK%20-%20Innah%20Peace%20v2.wav',
    )
  })

  it('still rewrites WAV to MP3 for proxied cloud playback', () => {
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com'
    expect(
      normalizeVaultAudioUrl(
        '/audio/unreleased/Playlists/Happy Camper/SERGIK - Innah Peace v2.wav',
      ),
    ).toBe(
      '/api/audio/media/unreleased/Playlists/Happy%20Camper/SERGIK%20-%20Innah%20Peace%20v2.mp3',
    )
  })

  it('vaultUpstreamUrl builds the absolute origin URL for server-side fetches', () => {
    expect(vaultUpstreamUrl('unreleased/a.mp3')).toBeNull()
    process.env.NEXT_PUBLIC_AUDIO_BASE_URL = 'https://media.example.com/'
    expect(vaultUpstreamUrl('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')).toBe(
      'https://media.example.com/audio/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
    )
  })
})
