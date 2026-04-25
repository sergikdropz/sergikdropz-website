import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export function requireSupabaseService() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            'Supabase is not configured for server routes. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only) in your environment (e.g. .env.local).',
        },
        { status: 503 }
      ),
    }
  }

  return {
    ok: true as const,
    supabase: createSupabaseServerClient(),
  }
}

