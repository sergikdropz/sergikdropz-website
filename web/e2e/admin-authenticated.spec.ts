import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function seriousViolations(violations: { impact?: string | null }[]) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

test.describe('admin (authenticated)', () => {
  test('dashboard has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'load' })
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(seriousViolations(violations), JSON.stringify(seriousViolations(violations), null, 2)).toEqual([])
  })

  test('dashboard and nav are reachable with saved session', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible()
  })

  test('primary nav destinations load', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible()

    const paths = ['/admin/music', '/admin/gallery', '/admin/analytics', '/admin/settings'] as const
    for (const path of paths) {
      const started = Date.now()
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page).not.toHaveURL(/\/admin\/login/)
      const ms = Date.now() - started
      console.log(`[admin-audit] ${path} domcontentloaded: ${ms}ms`)
      expect(ms).toBeLessThan(120_000)
    }
  })
})
