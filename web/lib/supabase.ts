import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client (for browser)
export const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client during build/development if env vars are missing
    // This prevents build errors when env vars aren't set yet
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing Supabase environment variables')
    }
    // For development, return a client that will error on actual use
    return createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-key',
    )
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'X-Client-Info': 'sergik-web',
      },
    },
  })
}

// Server-side Supabase client singleton (for API routes)
// This prevents connection pool exhaustion by reusing the same client instance
let _serverSupabaseClient: ReturnType<typeof createClient> | null = null

/**
 * Get or create the singleton server Supabase client instance
 * This prevents creating too many connections to the database
 */
export const createSupabaseServerClient = () => {
  // If we already have a client and env vars haven't changed, reuse it
  if (_serverSupabaseClient) {
    return _serverSupabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    // Return a mock client during build if env vars are missing
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing Supabase server environment variables')
    }
    // For development, return a client that will error on actual use
    return createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseServiceKey || 'placeholder-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  // Create and cache the server client with optimized settings
  _serverSupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'sergik-web-server',
      },
    },
  })

  return _serverSupabaseClient
}

// Default client export (for client-side use) - singleton pattern
let _supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

/**
 * Get or create the singleton Supabase client instance
 * Use this instead of createSupabaseClient() to avoid multiple instances
 * 
 * IMPORTANT: On the client-side, this returns a singleton instance.
 * On the server-side, it creates a new instance each time (stateless).
 */
export function getSupabaseClient(): ReturnType<typeof createSupabaseClient> {
  // Server-side: always create a new client (they're stateless)
  if (typeof window === 'undefined') {
    return createSupabaseClient()
  }
  
  // Client-side: use singleton to prevent multiple GoTrueClient instances
  if (!_supabaseClient) {
    _supabaseClient = createSupabaseClient()
  }
  return _supabaseClient
}

// Default client export (for client-side use) - uses singleton
// This ensures only one Supabase client instance exists in the browser
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_target, prop) {
    const client = getSupabaseClient()
    return (client as any)[prop]
  },
})

