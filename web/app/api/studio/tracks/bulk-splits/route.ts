import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { resolveTrackId } from '@/lib/studio/isrc'
import {
  parseSplitsImportCsv,
  validateSplitsTotal,
  type SplitRow,
} from '@/lib/studio/import-parse'
import { logActivity } from '@/lib/activity-log'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = createSupabaseServerClient()

    let rows: Array<{
      track_id?: string
      title?: string
      splits: SplitRow[]
    }> = []

    if (body.csv) {
      rows = parseSplitsImportCsv(body.csv)
        .filter((r) => !r.error)
        .map((r) => ({
          track_id: r.track_id,
          title: r.title,
          splits: r.splits,
        }))
    } else if (Array.isArray(body.rows)) {
      rows = body.rows
    } else {
      return NextResponse.json({ error: 'Provide csv or rows' }, { status: 400 })
    }

    const results: Array<{
      track_id: string
      status: 'ok' | 'error'
      message?: string
    }> = []

    for (const row of rows) {
      const splitError = validateSplitsTotal(row.splits)
      if (splitError) {
        results.push({
          track_id: row.track_id || row.title || 'unknown',
          status: 'error',
          message: splitError,
        })
        continue
      }

      const trackId = await resolveTrackId(supabase, {
        track_id: row.track_id,
        title: row.title,
      })

      if (!trackId) {
        results.push({
          track_id: row.track_id || row.title || 'unknown',
          status: 'error',
          message: 'Track not found',
        })
        continue
      }

      const { error } = await supabase
        .from('distribution_tracks')
        .update({ splits: row.splits })
        .eq('id', trackId)

      if (error) {
        results.push({ track_id: trackId, status: 'error', message: error.message })
      } else {
        results.push({ track_id: trackId, status: 'ok' })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    await logActivity({
      actionType: 'bulk_update_splits',
      resourceType: 'track',
      resourceId: 'bulk',
      details: { total: results.length, successful: ok },
    })

    return NextResponse.json({
      total: results.length,
      successful: ok,
      failed: results.length - ok,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bulk splits failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
