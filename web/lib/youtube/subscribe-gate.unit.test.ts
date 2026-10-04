import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmViewerSubscribedToSergik,
  readYtSubGate,
  readYtSubIntent,
  sealYtSubGate,
  sealYtSubIntent,
} from '@/lib/youtube/subscribe-gate'

describe('youtube subscribe gate cookie', () => {
  it('seals a token that reads back as unlocked', () => {
    const { token, maxAgeSec } = sealYtSubGate()
    expect(maxAgeSec).toBeGreaterThan(0)
    expect(readYtSubGate(token)).toBe(true)
  })

  it('rejects a tampered token and an expired one', () => {
    const { token } = sealYtSubGate()
    expect(readYtSubGate(`${token}x`)).toBe(false)
    const expired = sealYtSubGate(Date.now() - 40 * 24 * 60 * 60 * 1000)
    expect(readYtSubGate(expired.token)).toBe(false)
  })
})

describe('youtube subscribe intent', () => {
  it('keeps the email that opened the floating window', () => {
    const { token } = sealYtSubIntent('fan.name@gmail.com')
    expect(readYtSubIntent(token)).toBe('fan.name@gmail.com')
    expect(readYtSubIntent(`${token}x`)).toBeNull()
  })
})

describe('confirmViewerSubscribedToSergik', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays locked and does not create a subscription when the viewer is not subscribed', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/channels?')) {
        return new Response(JSON.stringify({ items: [{ id: 'UC_test_sergik' }] }), { status: 200 })
      }
      if (url.includes('/subscriptions?') && url.includes('mine=true')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await confirmViewerSubscribedToSergik('ya29.test-token')
    expect(result).toEqual({ ok: false, reason: 'unsubscribed' })
    expect(
      fetchMock.mock.calls.some((call) => (call as unknown as [string, RequestInit?])[1]?.method === 'POST'),
    ).toBe(false)
  })

  it('returns ok when the viewer is already subscribed', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/channels?')) {
        return new Response(JSON.stringify({ items: [{ id: 'UC_test_sergik' }] }), { status: 200 })
      }
      if (url.includes('/subscriptions?')) {
        return new Response(JSON.stringify({ items: [{ id: 'sub1' }] }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await confirmViewerSubscribedToSergik('ya29.test-token')
    expect(result).toEqual({ ok: true, channelId: 'UC_test_sergik' })
  })
})
