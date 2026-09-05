import { NextResponse } from 'next/server'

/**
 * Supabase outages sometimes surface as HTML error pages (Cloudflare 522/544).
 * For admin mutations, we want to fail fast with 503 (and NOT mutate anything).
 *
 * IMPORTANT: This does not require any secrets. We only verify the host is reachable.
 *
 * Positive results are cached briefly so concurrent player/admin PUTs under a busy
 * Next dev server don't each hit AbortSignal.timeout and false-503 the write.
 */
const REACHABLE_TTL_MS = 30_000
let lastReachableAt = 0

export async function supabaseIsReachable(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  if (lastReachableAt && Date.now() - lastReachableAt < REACHABLE_TTL_MS) {
    return true
  }

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': '1',
      },
      // Avoid long hangs during outages (Node 18+)
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    })

    // 401/403 still means PostgREST answered, so the host counts as reachable.
    // A dead tunnel serves its own 404/5xx page, which previously passed this
    // check and let the app report a healthy database during a full outage.
    if (res.status === 404 || res.status >= 500) return false

    lastReachableAt = Date.now()
    return true
  } catch {
    // Soft miss: if we recently saw a healthy host, don't flunk writes on a
    // single probe timeout (common during local compile spikes).
    if (lastReachableAt && Date.now() - lastReachableAt < REACHABLE_TTL_MS * 2) {
      return true
    }
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

