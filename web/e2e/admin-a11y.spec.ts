import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

function seriousViolations(violations: { impact?: string | null; id: string; help: string }[]) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

test.describe('admin accessibility', () => {
  test('login has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/admin/login', { waitUntil: 'load' })
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(seriousViolations(violations), JSON.stringify(seriousViolations(violations), null, 2)).toEqual([])
  })

  test('setup has no critical or serious axe violations', async ({ page }) => {
    await page.goto('/admin/setup', { waitUntil: 'load' })
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(seriousViolations(violations), JSON.stringify(seriousViolations(violations), null, 2)).toEqual([])
  })
})
