import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { migrateLegacyScheduledEpsToPending } from '@/lib/studio/migrate-scheduled-eps'

/**
 * POST /api/studio/releases/migrate-scheduled
 * One-shot: legacy release-schedule "scheduled" stubs → pending distribution releases
 * (vault import + copyright readiness pipeline), same path as Are We Awake.
 */
export async function POST() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const summary = await migrateLegacyScheduledEpsToPending(supabase)

    await logActivity({
      actionType: 'migrate_scheduled_eps_to_pending',
      resourceType: 'release',
      resourceId: 'release-schedule',
      details: {
        count: summary.results.length,
        scheduleCount: summary.scheduleCount,
        created: summary.results.filter((r) => r.action === 'created').length,
        linked: summary.results.filter((r) => r.action === 'linked').length,
      },
    })

    return NextResponse.json(summary)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    console.error('POST /api/studio/releases/migrate-scheduled:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
