import { test, expect } from '@playwright/test'

test.describe('public fan / shop surfaces', () => {
  test('shop home loads', async ({ page }) => {
    await page.goto('/shop', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/shop/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('music-library redirects guests to unlock', async ({ page }) => {
    await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/music-library\/unlock/)
  })

  test('music-library unlock page loads', async ({ page }) => {
    await page.goto('/music-library/unlock', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/music-library\/unlock/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('vault unlock API cookie allows music library without React hook crash', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const email = `e2e-vault-${Date.now()}@example.com`
    const unlock = await page.request.post('/api/fan/vault-unlock', {
      data: { email },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(unlock.ok()).toBeTruthy()
    const body = (await unlock.json()) as { ok?: boolean }
    expect(body.ok).toBe(true)

    await page.goto('/music-library', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/music-library\/?$/)
    await expect(page.getByRole('heading', { name: /SERGIK Music Vault/i })).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByText(/Minified React error/i)).toHaveCount(0)
    await expect(page.getByText(/Application error/i)).toHaveCount(0)
  })
})
