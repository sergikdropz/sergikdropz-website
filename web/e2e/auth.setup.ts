import * as fs from 'fs'
import * as path from 'path'
import { test as setup, expect } from '@playwright/test'
import { loginAsAdmin, resolveAdminCredentials } from './helpers/admin-login'

const authFile = path.join(process.cwd(), 'e2e', '.auth', 'admin.json')

setup('authenticate as admin', async ({ page }) => {
  const { email, password } = resolveAdminCredentials()
  setup.setTimeout(90_000)
  await loginAsAdmin(page, email, password)
  await expect(page.getByRole('link', { name: 'Admin Panel' })).toBeVisible()

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
