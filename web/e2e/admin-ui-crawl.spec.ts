import { test, expect } from '@playwright/test'
import { ADMIN_UI_CRAWL_PATHS } from './admin-ui-paths'

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

test.describe.configure({ mode: 'serial' })

test.describe('admin UI crawl (authenticated)', () => {
  test('every admin surface loads (no login redirect, document OK)', async ({ page }) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(`${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const rows: {
      path: string
      status: number | null
      ms: number
      timing: NavTiming | null
      finalPath: string
    }[] = []

    for (const path of ADMIN_UI_CRAWL_PATHS) {
      const t0 = Date.now()
      const response = await page.goto(path, { waitUntil: 'load', timeout: 120_000 })
      const ms = Date.now() - t0
      const status = response?.status() ?? null
      const timing = await collectNavTiming(page)
      const url = new URL(page.url())
      const finalPath = `${url.pathname}${url.search}`

      rows.push({ path, status, ms, timing, finalPath })

      await expect(page, `${path} should not bounce to admin login`).not.toHaveURL(/\/admin\/login/)
      if (status !== null) {
        expect(status, `${path} document HTTP status`).toBeLessThan(400)
      }
    }

    console.log('[admin-ui-crawl] summary:', JSON.stringify(rows, null, 2))
    if (consoleErrors.length) {
      console.log('[admin-ui-crawl] console errors (first 20):\n', consoleErrors.slice(0, 20).join('\n'))
    }

    expect(pageErrors, pageErrors.join('\n')).toEqual([])
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  })
})
