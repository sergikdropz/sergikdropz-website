/**
 * Dev-only credentials for /admin/login?autologin=1 and GET /api/auth/auto-login.
 * Never enable this in production.
 */
export function resolveDevAutoLoginCredentials(): { email: string; password: string } | null {
  if (process.env.NODE_ENV === 'production') return null

  const email = (
    process.env.ADMIN_AUTO_LOGIN_EMAIL ||
    process.env.E2E_ADMIN_EMAIL ||
    ''
  ).trim()
  const password =
    process.env.ADMIN_AUTO_LOGIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD || ''

  if (!email || !password) return null
  return { email, password }
}
