import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshSupabaseSession } from '@/lib/auth/token'

describe('refreshSupabaseSession', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shares one Supabase refresh across parallel callers and the next few seconds', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    const token = `refresh-${Date.now()}-${Math.random()}`
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 15))
        return new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      })
    )

    const [first, second] = await Promise.all([
      refreshSupabaseSession(token),
      refreshSupabaseSession(token),
    ])
    const third = await refreshSupabaseSession(token)

    expect(first?.access_token).toBe('new-access')
    expect(second?.refresh_token).toBe('new-refresh')
    expect(third?.access_token).toBe('new-access')
    expect(calls).toBe(1)
  })
})
