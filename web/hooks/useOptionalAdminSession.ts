'use client'

import { useEffect, useState } from 'react'

/**
 * Read-only admin flag for public pages (no AdminAuthProvider).
 * Uses the same httpOnly session API as the admin dashboard.
 */
export function useOptionalAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setIsAdmin(Boolean(d.authenticated && d.isAdmin))
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { isAdmin, loading }
}
