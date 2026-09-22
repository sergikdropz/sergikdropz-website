import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { normalizeIsrcInput, type SoundExchangeSubmissionStatus } from '@/lib/studio/soundexchange'
import { logActivity } from '@/lib/activity-log'

const ALLOWED: SoundExchangeSubmissionStatus[] = [
  'pending',
  'submitted',
  'accepted',
  'rejected',
  'error',
]

/**
 * GET /api/studio/soundexchange/submissions
 * SoundExchange submission history
 */
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('soundexchange_submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ submissions: [], error: error.message })
    }

    return NextResponse.json({ submissions: data || [] })
  } catch (error: unknown) {
    console.error('Error fetching SoundExchange submissions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch submissions' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/studio/soundexchange/submissions
 * Body: { isrcs: string[], status }
 * Updates latest submission rows so Pipeline registry reflects USISRC progress.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const status = body.status as SoundExchangeSubmissionStatus
    const isrcsRaw = Array.isArray(body.isrcs) ? body.isrcs : []
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const isrcs = [
      ...new Set(isrcsRaw.map((v: string) => normalizeIsrcInput(v)).filter(Boolean)),
    ] as string[]
    if (!isrcs.length) {
      return NextResponse.json({ error: 'isrcs required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data: existing, error } = await supabase
      .from('soundexchange_submissions')
      .select('id, isrc, submitted_at, created_at')
      .in('isrc', isrcs)
      .order('submitted_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const latestIds = new Map<string, string>()
    for (const row of existing || []) {
      const isrc = normalizeIsrcInput(row.isrc)
      if (!isrc || latestIds.has(isrc)) continue
      latestIds.set(isrc, row.id)
    }

    const ids = [...latestIds.values()]
    if (!ids.length) {
      return NextResponse.json({ error: 'No submission rows found for those ISRCs' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('soundexchange_submissions')
      .update({ status })
      .in('id', ids)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await logActivity({
      actionType: 'update_soundexchange_status',
      resourceType: 'isrc',
      details: { status, count: ids.length, isrcs },
    })

    return NextResponse.json({ success: true, updated: ids.length, status })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update submissions' },
      { status: 500 },
    )
  }
}
