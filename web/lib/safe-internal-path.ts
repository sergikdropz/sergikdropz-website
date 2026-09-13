/**
 * Returns a same-origin path safe to use in redirects, or null.
 * Rejects protocol-relative and external URLs.
 */
export function safeInternalPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null
  const p = path.trim()
  if (!p.startsWith('/') || p.startsWith('//')) return null
  if (p.includes(':') && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return null
  return p
}
