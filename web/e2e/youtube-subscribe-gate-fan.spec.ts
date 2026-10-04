import { test, expect } from '@playwright/test'

/**
 * Fan-facing UI smoke (requires YOUTUBE_OAUTH_* on server for full OAuth redirect).
 * Skips OAuth click when gate reports unconfigured.
 */
test.describe('YouTube subscribe gate — release videos row', () => {
  test('gate status is JSON-valid for fan unlock flow', async ({ request }) => {
    const status = await request.get('/api/youtube/subscribe-gate/status')
    expect(status.ok()).toBeTruthy()
    const gate = (await status.json()) as {
      configured?: boolean
      channel?: string
      subscriberCount?: number | null
    }

    expect(gate.channel).toBeTruthy()

    if (!gate.configured) {
      test.info().annotations.push({
        type: 'note',
        description: 'YOUTUBE_OAUTH_* not configured — run npm run setup:youtube-subscribe-gate:chrome',
      })
    } else {
      expect(gate.subscriberCount === null || typeof gate.subscriberCount === 'number').toBe(true)
    }
  })
})
