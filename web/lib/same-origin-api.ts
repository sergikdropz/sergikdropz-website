/**
 * Build a full same-origin API URL (avoids broken relative fetches in some embed/preview cases).
 * Client-only; safe to import from client components.
 */
export function sameOriginApiUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}
