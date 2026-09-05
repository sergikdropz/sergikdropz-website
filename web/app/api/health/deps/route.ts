import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

type HealthState = 'ok' | 'degraded'

function isSet(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET() {
  const checks = {
    env: {
      supabaseUrl: isSet(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseAnonKey: isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseServiceRoleKey: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY),
      stripePublishableKey: isSet(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      stripeSecretKey: isSet(process.env.STRIPE_SECRET_KEY),
      stripeWebhookSecret: isSet(process.env.STRIPE_WEBHOOK_SECRET),
      fanVaultUnlockSecret: isSet(process.env.FAN_VAULT_UNLOCK_SECRET),
      siteUrl: isSet(process.env.NEXT_PUBLIC_SITE_URL),
    },
    dependencies: {
      supabaseDatabase: 'unknown' as 'ok' | 'error',
      stripeConfigured: isSet(process.env.STRIPE_SECRET_KEY),
      resendConfigured: isSet(process.env.RESEND_API_KEY),
      sentryConfigured:
        isSet(process.env.SENTRY_DSN) || isSet(process.env.NEXT_PUBLIC_SENTRY_DSN),
      instagramGraphApi:
        isSet(process.env.INSTAGRAM_ACCESS_TOKEN) && isSet(process.env.INSTAGRAM_USER_ID),
    },
  }

  let overall: HealthState = 'ok'

  const requiredEnvReady = Object.values(checks.env).every(Boolean)
  if (!requiredEnvReady) {
    overall = 'degraded'
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
  const pointsAtLocalHome = /127\.0\.0\.1:8000|localhost:8000/.test(supabaseUrl)

  const reachable = await supabaseIsReachable()
  if (!reachable) {
    checks.dependencies.supabaseDatabase = 'error'
    overall = 'degraded'
  } else {
    try {
      const supabase = createSupabaseServerClient()
      const { error } = await supabase.from('audio_files').select('id', { head: true, count: 'exact' })
      checks.dependencies.supabaseDatabase = error ? 'error' : 'ok'
      if (error) overall = 'degraded'
    } catch {
      checks.dependencies.supabaseDatabase = 'error'
      overall = 'degraded'
    }
  }

  const hint =
    !reachable && pointsAtLocalHome
      ? 'Home-server Docker is stopped but web/.env.local still points at localhost:8000. Run: cd web && npm run env:cloud && npm run dev:restart'
      : undefined

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      checks,
      ...(hint ? { hint } : {}),
    },
    {
      status: overall === 'ok' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
