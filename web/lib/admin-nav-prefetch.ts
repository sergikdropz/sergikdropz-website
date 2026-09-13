'use client'

/**
 * Capped nav hover prefetch — warms Next.js routes for a small allowlist only.
 * Risk mitigations: cooldown, max 5 paths, ignore unknown hrefs.
 */

import { queryKeys } from '@/lib/api/query-keys'

const COOLDOWN_MS = 8_000
const lastPrefetch = new Map<string, number>()
const ALLOWED = new Set<string>(queryKeys.adminPrefetch.paths())

type PrefetchRouter = { prefetch?: (href: string) => void }

export function prefetchAdminRoute(router: PrefetchRouter | null | undefined, href: string) {
  if (!router?.prefetch) return
  if (!ALLOWED.has(href)) return

  const now = Date.now()
  const last = lastPrefetch.get(href) || 0
  if (now - last < COOLDOWN_MS) return
  lastPrefetch.set(href, now)

  try {
    router.prefetch(href)
  } catch {
    /* ignore */
  }
}
