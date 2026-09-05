import { getSupabaseClient, createSupabaseServerClient } from './supabase'
import { cookies, headers } from 'next/headers'
import { MW_SB_ACCESS_HEADER } from '@/lib/auth/middleware-bridge'
import { isJwtExpired, refreshSupabaseSession } from '@/lib/auth/token'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { cache } from 'react'

export type ServerAuthSession = {
  user: User
  isAdmin: boolean
}

/**
 * Resolve the Supabase user + admin flag from a JWT (any authenticated user).
 * Admin-only routes must still check `session.isAdmin`.
 */
export async function getServerSessionFromToken(authToken: string): Promise<ServerAuthSession | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return null
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    })

    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }

    const isAdmin = await checkAdminStatus(user.email || '', user.id)

    return {
      user,
      isAdmin,
    }
  } catch {
    return null
  }
}

/**
 * Server-side authentication utilities.
 * Cached per request so layouts and parallel server work only hit Supabase once.
 */
export const getServerSession = cache(async function getServerSession(): Promise<ServerAuthSession | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    // If Supabase is not configured, return null (not an error)
    if (!supabaseUrl || !supabaseAnonKey) {
      return null
    }

    let cookieStore
    try {
      cookieStore = await cookies()
    } catch (error: any) {
      // Cookies might not be available in some contexts
      return null
    }

    const headersList = await headers()
    const mwAccessToken = headersList.get(MW_SB_ACCESS_HEADER)
    let authToken = mwAccessToken || cookieStore.get('sb-auth-token')?.value

    if ((!authToken || isJwtExpired(authToken)) && !mwAccessToken) {
      const refreshToken = cookieStore.get('sb-refresh-token')?.value
      if (refreshToken) {
        const refreshed = await refreshSupabaseSession(refreshToken)
        if (refreshed?.access_token) {
          authToken = refreshed.access_token
        }
      }
    }

    if (!authToken) {
      return null
    }

    return await getServerSessionFromToken(authToken)
  } catch (error: any) {
    // Silently fail - this is expected when Supabase isn't configured or user isn't logged in
    return null
  }
})

/**
 * Check if a user has admin privileges
 */
export async function checkAdminStatus(email: string, userId: string): Promise<boolean> {
  try {
    // Option 1: Check against environment variable (simple)
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
    if (adminEmails.length > 0 && adminEmails.includes(email)) {
      return true
    }

    // Option 2: Check against database (more flexible)
    // You can create an 'admins' table in Supabase and check there
    try {
      const supabase = createSupabaseServerClient()
      const { data, error } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', userId)
        .eq('active', true)
        .single()
      
      if (!error && data) {
        return true
      }

      // If no admin is configured yet, allow dev access to unblock local setup.
      if (adminEmails.length === 0 && process.env.NODE_ENV !== 'production') {
        const { count, error: countError } = await supabase
          .from('admins')
          .select('id', { count: 'exact', head: true })
          .eq('active', true)

        if (countError || !count || count === 0) {
          return true
        }
      }
    } catch (error) {
      // Table might not exist yet, or Supabase not configured - fall through
      if (adminEmails.length === 0 && process.env.NODE_ENV !== 'production') {
        return true
      }
    }

    return false
  } catch (error) {
    // If anything fails, user is not admin
    return false
  }
}

/**
 * Client-side authentication utilities
 */
export function getClientSession() {
  const supabase = getSupabaseClient()
  return supabase.auth.getSession()
}

/**
 * Require admin authentication (for server components)
 */
export async function requireAdmin() {
  const session = await getServerSession()
  
  if (!session || !session.isAdmin) {
    throw new Error('Unauthorized: Admin access required')
  }
  
  return session
}
