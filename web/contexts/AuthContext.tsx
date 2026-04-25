'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  loading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  async function checkAdminStatus(user: User) {
    try {
      const response = await fetch('/api/auth/session')
      const data = await response.json()
      setIsAdmin(data.authenticated && data.isAdmin)
    } catch (error: any) {
      setIsAdmin(false)
    }
  }

  async function checkSession() {
    try {
      // First check server-side session via API (this uses the cookie)
      // This is more reliable than client-side Supabase session which may not be set
      const sessionResponse = await fetch('/api/auth/session', { credentials: 'include' })
      const sessionData = await sessionResponse.json()
      
      if (sessionData.authenticated && sessionData.user) {
        // Server-side session is valid - create a user object from the API response
        const user = {
          id: sessionData.user.id,
          email: sessionData.user.email,
        } as User
        
        setUser(user)
        setIsAdmin(sessionData.isAdmin || false)
        
        // Also try to sync with Supabase client session if possible
        try {
          const supabase = getSupabaseClient()
          const { data: { session } } = await supabase.auth.getSession()
          if (!session && sessionData.authenticated) {
            // If client session is missing but server session is valid, try to restore it
            // This happens when page reloads and Supabase client loses session
            // Note: We can't restore without the tokens, but at least we have the user info
          }
        } catch (e) {
          // Supabase client error - that's okay, we have server session
        }
      } else {
        // No server session - also check Supabase client as fallback
        try {
          const supabase = getSupabaseClient()
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (session?.user) {
            setUser(session.user)
            await checkAdminStatus(session.user)
            return
          }
        } catch (e) {
          // Supabase not configured or error
        }
        
        setUser(null)
        setIsAdmin(false)
      }
    } catch (error: any) {
      // Supabase not configured or error - set defaults
      setUser(null)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check initial session
    checkSession()

    // Get supabase client for auth state listener
    let supabase: ReturnType<typeof getSupabaseClient> | null = null
    try {
      supabase = getSupabaseClient()
    } catch (error) {
      // Supabase not configured
      setLoading(false)
      return
    }

    // Listen for auth changes
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            setUser(session.user)
            await checkAdminStatus(session.user)
          } else {
            setUser(null)
            setIsAdmin(false)
          }
          setLoading(false)
        }
      )

      return () => {
        subscription.unsubscribe()
      }
    } catch (error) {
      // If auth setup fails, just set loading to false
      setLoading(false)
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

      // Refresh session after successful login
      await refreshSession()

      return {}
    } catch (error: any) {
      return { error: error.message || 'Login failed' }
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      try {
        const supabase = getSupabaseClient()
        await supabase.auth.signOut()
      } catch (error) {
        // Supabase not configured, continue with logout
      }
      
      // Clear remembered credentials on logout
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('admin_remember_me')
        } catch {
          // Ignore storage errors
        }
      }
      
      setUser(null)
      setIsAdmin(false)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  async function refreshSession() {
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
    // Always return safe defaults in browser to prevent crashes during hot reload
    // This can happen during hot module replacement when the component tree is recreated
    if (typeof window !== 'undefined') {
      // We're in the browser - return safe defaults to prevent crashes
      // This handles hot reload scenarios where the provider might not be mounted yet
      // Suppress warning in development to reduce console noise during hot reload
      // if (process.env.NODE_ENV === 'development') {
      //   console.warn('useAuth called outside AuthProvider (likely during hot reload). Returning safe defaults.')
      // }
      return {
        user: null,
        loading: true,
        isAdmin: false,
        login: async () => ({ error: 'AuthProvider not available' }),
        logout: async () => {},
        refreshSession: async () => {},
      }
    }
    
    // Server-side: throw error to catch actual bugs
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
