import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBrowserAuthSession,
  resetBrowserAuthSessionCacheForTests,
} from '@/lib/auth/browser-session'

describe('fetchBrowserAuthSession', () => {
  beforeEach(() => {
    // Module is browser-gated on `window`; vitest node env needs a stub.
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    resetBrowserAuthSessionCacheForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dedupes concurrent fetches into one network call', async () => {
    let resolveFetch!: (value: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn(() => fetchPromise)
    vi.stubGlobal('fetch', fetchMock)

    const a = fetchBrowserAuthSession()
    const b = fetchBrowserAuthSession()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch(
      new Response(JSON.stringify({ authenticated: true, isAdmin: false, user: { id: 'u1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const [ra, rb] = await Promise.all([a, b])
    expect(ra?.user?.id).toBe('u1')
    expect(rb?.user?.id).toBe('u1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves TTL cache without a second network call', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchBrowserAuthSession()
    await fetchBrowserAuthSession()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
