import { NextResponse } from 'next/server'

/**
 * Supabase outages sometimes surface as HTML error pages (Cloudflare 522/544).
 * For admin mutations, we want to fail fast with 503 (and NOT mutate anything).
 *
 * IMPORTANT: This does not require any secrets. We only verify the host is reachable.
 */
export async function supabaseIsReachable(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  try {
    // Any response (including 401) means the host is reachable.
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`, {
      method: 'GET',
      // Avoid long hangs during outages (Node 18+)
      signal: AbortSignal.timeout(2500),
    })
    return !!res
  } catch {
    return false
  }
}

export function supabaseUnavailableResponse(message = 'Supabase is temporarily unavailable') {
  return NextResponse.json(
    {
      error: message,
      retryable: true,
    },
    { status: 503 },
  )
}

