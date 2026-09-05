'use client'

/**
 * Admin-only auth context. Sessions are httpOnly cookies validated on the server.
 * This provider never listens to Supabase client auth events (which caused false
 * logouts and redirect loops when the browser client had no session).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import type { ServerAuthSession } from '@/lib/auth'

export interface AdminAuthContextType {
  user: User | null
  /** True once the server layout verified admin access for this navigation. */
  serverVerified: boolean
  isAdmin: boolean
  loading: boolean
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

type SessionApiResponse = {
  authenticated?: boolean
  isAdmin?: boolean
  user?: { id: string; email?: string | null }
}

async function fetchServerSession(): Promise<SessionApiResponse | null> {
  try {
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) return null
    return (await response.json()) as SessionApiResponse
  } catch {
    return null
  }
}

function userFromPayload(data: SessionApiResponse): User | null {
  if (!data.authenticated || !data.user?.id) return null
  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  } as User
}

const FOCUS_SYNC_MS = 60_000

export function AdminAuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode
  initialSession: ServerAuthSession
}) {
  const [user, setUser] = useState<User | null>(initialSession.user)
  const [isAdmin, setIsAdmin] = useState(initialSession.isAdmin)
  const [loading, setLoading] = useState(false)
  const lastSyncRef = useRef(Date.now())
  const syncInFlightRef = useRef(false)

  const applySession = useCallback((data: SessionApiResponse | null) => {
    if (data?.authenticated && data.isAdmin && data.user) {
      setUser(userFromPayload(data))
      setIsAdmin(true)
      return true
    }
    return false
  }, [])

  const syncSession = useCallback(async () => {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
    try {
      const data = await fetchServerSession()
      if (!applySession(data)) {
        // Do not clear user or redirect — middleware + server layout gate access.
        // A transient API miss should not boot the user client-side.
        console.warn('[AdminAuth] Background session sync did not return admin; keeping server-verified state')
      }
    } finally {
      syncInFlightRef.current = false
      lastSyncRef.current = Date.now()
    }
  }, [applySession])

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastSyncRef.current < FOCUS_SYNC_MS) return
      void syncSession()
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [syncSession])

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // continue
    }

    try {
      localStorage.removeItem('admin_remember_me')
    } catch {
      // ignore
    }

    setUser(null)
    setIsAdmin(false)
    window.location.replace('/admin/login')
  }

  async function refreshSession() {
    setLoading(true)
    await syncSession()
    setLoading(false)
  }

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        serverVerified: true,
        isAdmin,
        loading,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  )
}

/** Admin dashboard auth — server-verified; never redirects to login client-side. */
export function useAdminAuth(): AdminAuthContextType {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return ctx
}

/**
 * @deprecated Admin pages should use useAdminAuth(). Kept for gradual migration.
 */
export function useAuth(): AdminAuthContextType {
  return useAdminAuth()
}
