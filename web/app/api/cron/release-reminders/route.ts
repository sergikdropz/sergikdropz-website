import { NextRequest, NextResponse } from 'next/server'
import { flushDueDepartmentMail } from '@/lib/email/department-mailbox-store'
import { deliverDueOwnerReleaseReminders } from '@/lib/studio/deliver-owner-release-reminders'

export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || process.env.INSTAGRAM_CRON_SECRET || '').trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Sends due owner release reminders (Staying A Vibe: Oct 7 and Oct 8, 9:00 America/Phoenix).
 * GET or POST /api/cron/release-reminders
 * Authorization: Bearer $CRON_SECRET
 */
async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const reminders = await deliverDueOwnerReleaseReminders()
    let departmentMailSent = 0
    try {
      departmentMailSent = await flushDueDepartmentMail()
    } catch (mailError) {
      console.error('[Cron] Department mail flush error:', mailError)
    }
    return NextResponse.json({ ok: true, reminders, departmentMailSent })
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
