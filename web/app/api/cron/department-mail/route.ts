import { NextRequest, NextResponse } from 'next/server'
import { flushDueDepartmentMail } from '@/lib/email/department-mailbox-store'

export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || process.env.INSTAGRAM_CRON_SECRET || '').trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Sends department mail whose scheduled time has passed.
 * GET or POST /api/cron/department-mail
 * Authorization: Bearer $CRON_SECRET
 */
async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const sent = await flushDueDepartmentMail()
    return NextResponse.json({ ok: true, sent })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
