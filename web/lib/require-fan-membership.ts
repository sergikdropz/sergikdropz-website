import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth/request-session'
import { findActiveMembershipRow } from '@/lib/membership-queries'
import { fanHasPasswordCredential } from '@/lib/fan-password-credential'
import type { ServerAuthSession } from '@/lib/auth'

export type FanMembershipResult =
  | { ok: true; session: ServerAuthSession }
  | { ok: false; response: NextResponse }

/**
 * Any authenticated fan (magic link) or admin — used for playlists, purchase history, and vault.
 * Shop Stripe checkout requires {@link requireFanAuthWithPassword} instead.
 */
export async function requireFanAuth(request: NextRequest): Promise<FanMembershipResult> {
  const session = await getSessionFromRequest(request)
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sign in required', code: 'AUTH_REQUIRED' },
        { status: 401 },
      ),
    }
  }
  return { ok: true, session }
}

/**
 * Same as {@link requireFanAuth} but requires email+password (or admin). Used for music/merch/subscription checkout.
 */
export async function requireFanAuthWithPassword(
  request: NextRequest
): Promise<FanMembershipResult> {
  const base = await requireFanAuth(request)
  if (!base.ok) return base
  if (base.session.isAdmin) {
    return base
  }
  const ok = await fanHasPasswordCredential(base.session.user.id)
  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Create a password on your fan account to purchase or download from the shop.',
          code: 'PASSWORD_AUTH_REQUIRED',
        },
        { status: 403 }
      ),
    }
  }
  return base
}

/**
 * Requires an active paid Stripe membership (or admin). Use for premium-only APIs when added.
 */
export async function requireFanMembership(request: NextRequest): Promise<FanMembershipResult> {
  const session = await getSessionFromRequest(request)
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sign in required', code: 'AUTH_REQUIRED' },
        { status: 401 },
      ),
    }
  }
  if (session.isAdmin) {
    return { ok: true, session }
  }

  const supabase = createSupabaseServerClient()
  const row = await findActiveMembershipRow(supabase, {
    userId: session.user.id,
    email: session.user.email ?? null,
  })
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Paid fan membership required',
          code: 'MEMBERSHIP_REQUIRED',
        },
        { status: 403 },
      ),
    }
  }
  return { ok: true, session }
}
