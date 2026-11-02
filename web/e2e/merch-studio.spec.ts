import { test, expect } from '@playwright/test'

test.describe('merch design studio (admin)', () => {
  test('studio chrome loads with docks collapsed', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    await page.goto('/admin/merch', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/admin\/login/)
    await expect(page.getByRole('heading', { name: /MERCH DESIGNER STUDIO/i })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Design$/ }).last()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Placements' })).toBeVisible()

    const setup = page.getByRole('button', { name: /Finish Printful API setup/i })
    if (await setup.count()) {
      await expect(setup).toHaveAttribute('aria-expanded', 'false')
    }

    const specs = page.getByRole('button', { name: /Product specs/i })
    const emptyRail = page.getByText(/Pick a product in the Printful catalog/i)
    await expect(specs.or(emptyRail)).toBeVisible({ timeout: 30_000 })
    if (await specs.count()) {
      await expect(specs).toHaveAttribute('aria-expanded', 'false')
      await specs.click()
      await expect(specs).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('tab', { name: 'Description' })).toBeVisible()
    }
  })
})
