import { test, expect } from '@playwright/test'

test.describe('YouTube subscribe gate API', () => {
  test('status and ack enforce subscription', async ({ request }) => {
    const status = await request.get('/api/youtube/subscribe-gate/status')
    expect(status.ok()).toBeTruthy()
    const body = (await status.json()) as {
      unlocked?: boolean
      configured?: boolean
      channel?: string
    }
    expect(typeof body.unlocked).toBe('boolean')
    expect(typeof body.configured).toBe('boolean')
    expect(body.channel).toBeTruthy()

    const ack = await request.post('/api/youtube/subscribe-gate/ack', {
      data: {},
    })
    expect(ack.ok()).toBeTruthy()
    const ackBody = (await ack.json()) as { unlocked?: boolean; needsAccount?: boolean }
    expect(ackBody.unlocked).toBe(false)
    expect(ackBody.needsAccount).toBe(true)
  })

  test('start redirects (OAuth or unconfigured)', async ({ request }) => {
    const res = await request.get('/api/youtube/subscribe-gate/start?next=%2Fmusic-library', {
      maxRedirects: 0,
    })
    expect([302, 307]).toContain(res.status())
    const location = res.headers()['location'] || ''
    expect(location.length).toBeGreaterThan(0)
  })
})
