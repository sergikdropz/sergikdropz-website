import { test, expect } from '@playwright/test'

type NavTiming = {
  domContentLoadedMs: number
  loadEventMs: number
  ttfbMs: number
}

async function collectNavTiming(page: import('@playwright/test').Page): Promise<NavTiming | null> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (!nav) return null
    return {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      loadEventMs: Math.round(nav.loadEventEnd - nav.startTime),
      ttfbMs: Math.round(nav.responseStart - nav.startTime),
    }
  })
}

test.describe('admin audit (guest)', () => {
  test('protected admin API returns 401 without session', async ({ request }) => {
    const res = await request.get('/api/admin/settings')
    expect(res.status()).toBe(401)
  })

  test('logs navigation timing for auth surfaces', async ({ page }) => {
    const paths = ['/admin/login', '/admin/setup'] as const
    const rows: { path: string; timing: NavTiming | null }[] = []

    for (const path of paths) {
      await page.goto(path, { waitUntil: 'load' })
      const timing = await collectNavTiming(page)
      rows.push({ path, timing })
    }

    // Surface in CI / local output for manual review
    console.log('[admin-audit] navigation timing (ms):', JSON.stringify(rows, null, 2))

    for (const row of rows) {
      expect(row.timing, `timing for ${row.path}`).not.toBeNull()
      if (row.timing) {
        expect(row.timing.domContentLoadedMs).toBeLessThan(60_000)
      }
    }
  })

  test('no uncaught console errors on login page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/admin/login', { waitUntil: 'load' })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
