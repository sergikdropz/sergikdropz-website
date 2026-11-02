import type { Page } from '@playwright/test'

/**
 * Reach /admin as an authenticated admin: try dev autologin first, then the login form.
 */
export async function loginAsAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login?autologin=1', { waitUntil: 'domcontentloaded' })

  const emailField = page.getByLabel('Email')
  const adminHome = page.getByRole('link', { name: 'Admin Panel' })
  await emailField.or(adminHome).waitFor({ state: 'visible', timeout: 60_000 })

  if (!/\/admin\/login/.test(page.url()) && (await adminHome.count())) {
    return
  }

  if (!(await emailField.isVisible())) {
    await page.waitForURL(/\/admin\/?$/, { timeout: 15_000 })
    return
  }

  await emailField.fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL(/\/admin\/?$/, { timeout: 60_000 })
}

export function resolveAdminCredentials(): { email: string; password: string } {
  const email = (process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_AUTO_LOGIN_EMAIL || '').trim()
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_AUTO_LOGIN_PASSWORD || ''
  if (!email || !password) {
    throw new Error(
      'Missing admin credentials for E2E. Set E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD ' +
        '(or ADMIN_AUTO_LOGIN_EMAIL + ADMIN_AUTO_LOGIN_PASSWORD) in web/.env.local — Playwright loads that file automatically.'
    )
  }
  return { email, password }
}
