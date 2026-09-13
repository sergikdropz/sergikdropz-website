/** Routes that must not require an admin session (login / first-time setup). */
export const ADMIN_AUTH_PATHS = ['/admin/login', '/admin/setup'] as const

export function isAdminAuthPath(pathname: string): boolean {
  return (ADMIN_AUTH_PATHS as readonly string[]).includes(pathname)
}
