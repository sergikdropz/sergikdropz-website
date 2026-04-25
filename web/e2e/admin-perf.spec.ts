import { test, expect } from '@playwright/test'

/**
 * Run against a production server (no dev webServer in Playwright config).
 * Example:
 *   cd web && npm run build && npm run start:3001
 *   PLAYWRIGHT_PERF=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:e2e:perf
 */
test.describe('admin perf (production build)', () => {
  test('auth surfaces reach load with reasonable timing', async ({ page }) => {
    const paths = ['/admin/login', '/admin/setup'] as const
    for (const p of paths) {
      const t0 = Date.now()
      await page.goto(p, { waitUntil: 'load', timeout: 60_000 })
      const ms = Date.now() - t0
      console.log(`[perf] ${p} load: ${ms}ms`)
      expect(ms).toBeLessThan(30_000)
      if (p === '/admin/login') {
        await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: 'Admin Setup' })).toBeVisible()
      }
    }
  })
})
