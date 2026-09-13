import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'

const SETUP_WINDOW_MS = 60 * 60 * 1000
const SETUP_MAX_PER_HOUR = 20

export type SetupGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

/**
 * Harden public bootstrap endpoints.
 * - Disabled when ADMIN_PUBLIC_SETUP_DISABLED=1 (required in production)
 * - Production always fails closed unless an explicit ADMIN_SETUP_TOKEN matches
 * - Rate-limited per client
 */
export function gateAdminPublicSetup(request: NextRequest): SetupGateResult {
  const isProd = process.env.NODE_ENV === 'production'
  const disabled =
    process.env.ADMIN_PUBLIC_SETUP_DISABLED === '1' ||
    (isProd && process.env.ADMIN_PUBLIC_SETUP_DISABLED !== '0')

  if (disabled) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin setup is disabled.' }, { status: 403 }),
    }
  }

  if (isProd) {
    const expected = process.env.ADMIN_SETUP_TOKEN?.trim()
    const provided =
      request.headers.get('x-admin-setup-token')?.trim() ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!expected || !provided || provided !== expected) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Admin setup requires a valid setup token in production.' },
          { status: 403 }
        ),
      }
    }
  }

  const rl = checkRateLimit(
    `admin-setup:${clientKeyFromRequest(request)}`,
    SETUP_MAX_PER_HOUR,
    SETUP_WINDOW_MS
  )
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many setup requests. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        }
      ),
    }
  }

  return { ok: true }
}

/** Prefer server env credentials; never trust client-supplied service keys in production. */
export function resolveSetupSupabaseCredentials(body: {
  supabaseUrl?: string
  supabaseAnonKey?: string
  supabaseServiceKey?: string
}): { ok: true; url: string; anonKey: string; serviceKey: string } | { ok: false; error: string } {
  const isProd = process.env.NODE_ENV === 'production'
  const url = (isProd ? process.env.NEXT_PUBLIC_SUPABASE_URL : body.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const anonKey = (
    isProd
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : body.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim()
  const serviceKey = (
    isProd
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : body.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim()

  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false,
      error: isProd
        ? 'Server Supabase credentials are not configured.'
        : 'Supabase URL, anon key, and service key are required.',
    }
  }

  return { ok: true, url, anonKey, serviceKey }
}
