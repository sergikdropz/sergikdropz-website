import { test, expect } from '@playwright/test'

test.describe('admin (unauthenticated)', () => {
  test('redirects /admin to login', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('login page renders form', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible()
  })

  test('setup page renders', async ({ page }) => {
    await page.goto('/admin/setup')
    await expect(page.getByRole('heading', { name: 'Admin Setup' })).toBeVisible()
  })

  test('deep admin path redirects when not logged in', async ({ page }) => {
    await page.goto('/admin/music', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
