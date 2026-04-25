import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit'
import {
  FAN_VAULT_UNLOCK_COOKIE,
  sealFanVaultUnlock,
} from '@/lib/fan-vault-unlock-cookie'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 30

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (!s.includes('@') || s.length > 320) return null
  return s
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`vault-unlock:${clientKeyFromRequest(request)}`, MAX_ATTEMPTS, WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    if (!email) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 120) || null : null
    const source = typeof body.source === 'string' ? body.source.trim().slice(0, 64) || null : null
    const campaign = typeof body.campaign === 'string' ? body.campaign.trim().slice(0, 64) || null : null

    const supabase = createSupabaseServerClient()
    const now = new Date().toISOString()

    const { data: existing } = await supabase
      .from('fan_leads')
      .select('id,first_unlock_at')
      .eq('email', email)
      .maybeSingle()

    if (existing?.id) {
      const patch: Record<string, string | null> = {
        last_unlock_at: now,
        updated_at: now,
      }
      if (displayName !== null) patch.display_name = displayName
      if (source !== null) patch.source = source
      if (campaign !== null) patch.campaign = campaign
      await supabase.from('fan_leads').update(patch).eq('id', existing.id)
    } else {
      const { error: insErr } = await supabase.from('fan_leads').insert({
        email,
        display_name: displayName,
        source,
        campaign,
        first_unlock_at: now,
        last_unlock_at: now,
        created_at: now,
        updated_at: now,
      })
      if (insErr) {
        console.error('fan_leads insert:', insErr)
        return NextResponse.json({ error: 'Could not save your email. Try again later.' }, { status: 500 })
      }
    }

    const { token, maxAgeSec } = sealFanVaultUnlock(email)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(FAN_VAULT_UNLOCK_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSec,
      path: '/',
    })
    return res
  } catch (e) {
    console.error('vault-unlock:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
