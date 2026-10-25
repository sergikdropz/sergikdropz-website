/** Dev server on this Mac. The live site sends Admin browser actions here. */
export const ADMIN_BROWSER_LOCAL_ORIGIN = 'http://127.0.0.1:3001'
export const ADMIN_BROWSER_LOCAL_PATH = '/api/local/admin-browser'
export const ADMIN_BROWSER_BRIDGE_TTL_SEC = 10 * 60

/** Public admin pages allowed to call the Mac. */
export const ADMIN_BROWSER_BRIDGE_ORIGINS = [
  'https://sergikdropz.com',
  'https://www.sergikdropz.com',
] as const

export function isAdminBrowserBridgeOrigin(origin: string | null): boolean {
  return Boolean(origin && (ADMIN_BROWSER_BRIDGE_ORIGINS as readonly string[]).includes(origin))
}
