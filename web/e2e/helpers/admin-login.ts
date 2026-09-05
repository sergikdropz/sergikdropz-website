import type { Page } from '@playwright/test'

/**
 * Reach /admin as an authenticated admin: try dev autologin first, then the login form.
 */
export async function loginAsAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login?autologin=1', { waitUntil: 'domcontentloaded' })

  try {
    await page.waitForURL(/\/admin\/?$/, { timeout: 25_000 })
    return
  } catch {
    // fall through to manual submit
  }

  const stillOnLogin = /\/admin\/login/.test(page.url())
  if (!stillOnLogin) {
    throw new Error(`Unexpected URL after autologin: ${page.url()}`)
  }

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
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
