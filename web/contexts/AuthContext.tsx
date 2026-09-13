'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { ServerAuthSession } from '@/lib/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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

function userFromSessionPayload(data: SessionApiResponse): User | null {
  if (!data.authenticated || !data.user?.id) return null
  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  } as User
}

export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: ReactNode
  initialSession?: ServerAuthSession | null
}) {
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null)
  const [loading, setLoading] = useState(!initialSession)
  const [isAdmin, setIsAdmin] = useState(initialSession?.isAdmin ?? false)
  const serverSessionValidRef = useRef(Boolean(initialSession?.isAdmin))

  async function applyServerSession(data: SessionApiResponse | null) {
    if (data?.authenticated && data.user) {
      const nextUser = userFromSessionPayload(data)
      setUser(nextUser)
      setIsAdmin(Boolean(data.isAdmin))
      serverSessionValidRef.current = Boolean(data.isAdmin)
      return true
    }

    setUser(null)
    setIsAdmin(false)
    serverSessionValidRef.current = false
    return false
  }

  async function checkSession() {
    try {
      const sessionData = await fetchServerSession()
      if (sessionData?.authenticated && sessionData.user) {
        await applyServerSession(sessionData)
        return
      }

      // Fallback: Supabase client session (e.g. right after setSession on login)
      try {
        const supabase = getSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(session.user)
          const adminData = await fetchServerSession()
          if (adminData?.authenticated) {
            await applyServerSession(adminData)
            return
          }
        }
      } catch {
        // Supabase not configured
      }

      await applyServerSession(null)
    } catch {
      setUser(null)
      setIsAdmin(false)
      serverSessionValidRef.current = false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialSession) {
      void checkSession()
    }

    let supabase: ReturnType<typeof getSupabaseClient> | null = null
    try {
      supabase = getSupabaseClient()
    } catch {
      setLoading(false)
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user)
          const adminData = await fetchServerSession()
          if (adminData?.authenticated) {
            await applyServerSession(adminData)
          } else {
            setIsAdmin(false)
            serverSessionValidRef.current = false
          }
          setLoading(false)
          return
        }

        // Cookie-based sessions do not populate the Supabase client. Before clearing
        // auth state, confirm the httpOnly session is actually gone.
        const adminData = await fetchServerSession()
        if (adminData?.authenticated) {
          await applyServerSession(adminData)
        } else if (!serverSessionValidRef.current) {
          setUser(null)
          setIsAdmin(false)
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function login(email: string, password: string) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { error: data.error || 'Login failed' }
      }

      await refreshSession()
      return {}
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed'
      return { error: message }
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      try {
        const supabase = getSupabaseClient()
        await supabase.auth.signOut()
      } catch {
        // Supabase not configured
      }

      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('admin_remember_me')
        } catch {
          // Ignore storage errors
        }
      }

      serverSessionValidRef.current = false
      setUser(null)
      setIsAdmin(false)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  async function refreshSession() {
    setLoading(true)
    await checkSession()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    if (typeof window !== 'undefined') {
      return {
        user: null,
        loading: true,
        isAdmin: false,
        login: async () => ({ error: 'AuthProvider not available' }),
        logout: async () => {},
        refreshSession: async () => {},
      }
    }

    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
