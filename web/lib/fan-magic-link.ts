import type { NextRequest } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'
import { safeInternalPath } from '@/lib/safe-internal-path'

export function fanAuthBaseUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function sendFanMagicLinkEmail(
  request: NextRequest,
  opts: { email: string; displayName?: string; next?: string | null }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const email = opts.email.trim().toLowerCase()
  if (!email.includes('@')) {
    return { ok: false, error: 'Valid email is required', status: 400 }
  }

  const nextPath = safeInternalPath(opts.next) || '/fan/account'
  const baseUrl = fanAuthBaseUrl(request)
  const emailRedirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`

  const supabase = createSupabaseClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
      data: opts.displayName ? { display_name: opts.displayName } : undefined,
    },
  })

  if (error) {
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}
