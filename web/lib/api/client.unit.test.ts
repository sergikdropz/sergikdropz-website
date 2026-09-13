import { describe, expect, it } from 'vitest'
import { ApiError, apiClient } from '@/lib/api/client'

describe('apiClient', () => {
  it('returns JSON on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    await expect(apiClient<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true })
    globalThis.fetch = originalFetch
  })

  it('throws ApiError with status and code', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Nope', code: 'ADMIN_REQUIRED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    await expect(apiClient('/api/secure')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'ADMIN_REQUIRED',
    } satisfies Partial<ApiError>)
    globalThis.fetch = originalFetch
  })
})
