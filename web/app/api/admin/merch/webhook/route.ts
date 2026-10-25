import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  PRINTFUL_WEBHOOK_EVENTS,
  disablePrintfulWebhook,
  getPrintfulWebhook,
  registerPrintfulWebhook,
} from '@/lib/printful'

export const dynamic = 'force-dynamic'

function siteOrigin(request: Request): string {
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (envUrl) return envUrl
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return host ? `${proto}://${host}` : ''
}

function webhookUrl(request: Request): string | null {
  const origin = siteOrigin(request)
  if (!origin || origin.includes('localhost')) return null
  const secret = (process.env.PRINTFUL_WEBHOOK_SECRET || '').trim()
  const token = secret ? `?token=${encodeURIComponent(secret)}` : ''
  return `${origin}/api/printful/webhook${token}`
}

export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const target = webhookUrl(request)
  try {
    const current = await getPrintfulWebhook()
    return NextResponse.json({
      configured: Boolean(process.env.PRINTFUL_API_KEY),
      secretSet: Boolean(process.env.PRINTFUL_WEBHOOK_SECRET),
      targetUrl: target,
      current,
      events: PRINTFUL_WEBHOOK_EVENTS,
    })
  } catch (error: any) {
    return NextResponse.json(
      { configured: Boolean(process.env.PRINTFUL_API_KEY), targetUrl: target, error: error.message },
      { status: 200 },
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const target = webhookUrl(request)
  if (!target) {
    return NextResponse.json(
      {
        error:
          'Need a public https site URL. Set NEXT_PUBLIC_SITE_URL (not localhost) before registering the webhook.',
      },
      { status: 400 },
    )
  }
  try {
    const result = await registerPrintfulWebhook(target, [...PRINTFUL_WEBHOOK_EVENTS])
    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
}

export async function DELETE() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  try {
    const result = await disablePrintfulWebhook()
    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
}
