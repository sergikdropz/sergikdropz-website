import { test, expect } from '@playwright/test'

const protectedAdminPaths = [
  '/api/admin/settings',
  '/api/admin/users',
  '/api/admin/purchases',
  '/api/admin/logs',
] as const

test.describe('admin API (unauthenticated)', () => {
  for (const path of protectedAdminPaths) {
    test(`${path} returns 401`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(401)
    })
  }
})
