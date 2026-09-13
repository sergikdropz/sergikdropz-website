import * as fs from 'fs'
import * as path from 'path'
import { test as setup, expect } from '@playwright/test'

const authFile = path.join(process.cwd(), 'e2e', '.auth', 'admin.json')

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set for setup project')
  }

  await page.goto('/admin/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL(/\/admin\/?$/, { timeout: 60_000 })
  await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible()

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
