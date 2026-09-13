import { describe, expect, it } from 'vitest'
import { isHomeApiPlainTextError } from './local-artwork'
import { isLocalHomeSupabase } from './supabase'

describe('local artwork / home gateway', () => {
  it('detects the Caddy plaintext gateway body', () => {
    expect(isHomeApiPlainTextError(new Error('Unexpected token \'s\', "sergik-home-api" is not valid JSON'))).toBe(true)
    expect(isHomeApiPlainTextError(new Error('Failed to upload'))).toBe(false)
  })

  it('detects the local home-server Supabase URL', () => {
    expect(isLocalHomeSupabase('http://127.0.0.1:8000')).toBe(true)
    expect(isLocalHomeSupabase('http://localhost:8000')).toBe(true)
    expect(isLocalHomeSupabase('https://abc.ngrok-free.dev')).toBe(true)
    expect(isLocalHomeSupabase('https://abc.trycloudflare.com')).toBe(true)
    expect(isLocalHomeSupabase('https://utgwlgcejflqxyalnlze.supabase.co')).toBe(false)
  })
})
