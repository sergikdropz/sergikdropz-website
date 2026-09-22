import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  assignISRC,
  resolveIsrcPrefix,
  resolveTrackId,
  setExistingISRC,
  validateISRC,
} from '@/lib/studio/isrc'
import { parseIsrcImportCsv } from '@/lib/studio/import-parse'
import { logActivity } from '@/lib/activity-log'
import { pushDistributionToVault } from '@/lib/studio/vault-writeback'

type BulkBody =
  | { trackIds: string[] }
  | { csv: string }
  | { rows: Array<{ track_id?: string; title?: string; isrc?: string }> }

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prefix = resolveIsrcPrefix()

    const body = (await request.json()) as BulkBody
    const supabase = createSupabaseServerClient()

    let items: Array<{
      track_id?: string
      title?: string
      isrc?: string
      action: 'assign_new' | 'set_existing'
    }> = []

    if ('csv' in body && body.csv) {
      items = parseIsrcImportCsv(body.csv).filter((r) => !r.error)
    } else if ('rows' in body && body.rows) {
      items = body.rows.map((r) => ({
        track_id: r.track_id,
        title: r.title,
        isrc: r.isrc?.toUpperCase().replace(/-/g, ''),
        action:
          r.isrc && r.isrc !== 'AUTO' && r.isrc !== 'NEW'
            ? ('set_existing' as const)
            : ('assign_new' as const),
      }))
    } else if ('trackIds' in body && body.trackIds?.length) {
      items = body.trackIds.map((id) => ({
        track_id: id,
        action: 'assign_new' as const,
      }))
    } else {
      return NextResponse.json(
        { error: 'Provide trackIds, csv, or rows' },
        { status: 400 }
      )
    }

    const results: Array<{
      track_id: string
      title?: string
      isrc?: string
      status: 'ok' | 'error'
      message?: string
    }> = []

    for (const item of items) {
      const trackId = await resolveTrackId(supabase, {
        track_id: item.track_id,
        title: item.title,
      })

      if (!trackId) {
        results.push({
          track_id: item.track_id || item.title || 'unknown',
          status: 'error',
          message: 'Track not found',
        })
        continue
      }

      try {
        if (item.action === 'set_existing' && item.isrc) {
          if (!validateISRC(item.isrc)) {
            results.push({
              track_id: trackId,
              status: 'error',
              message: 'Invalid ISRC format',
            })
            continue
          }
          const parsed = await setExistingISRC(trackId, item.isrc)
          results.push({ track_id: trackId, isrc: parsed.isrc_full, status: 'ok' })
        } else {
          const assignment = await assignISRC(trackId, prefix)
          results.push({ track_id: trackId, isrc: assignment.isrc, status: 'ok' })
        }
      } catch (err: unknown) {
        results.push({
          track_id: trackId,
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed',
        })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    const okIds = results.filter((r) => r.status === 'ok').map((r) => r.track_id)
    if (okIds.length) {
      try {
        const { data: linked } = await supabase
          .from('distribution_tracks')
          .select('id, release_id')
          .in('id', okIds)
        const byRelease = new Map<string, string[]>()
        for (const row of linked || []) {
          if (!row.release_id) continue
          const list = byRelease.get(row.release_id) || []
          list.push(row.id)
          byRelease.set(row.release_id, list)
        }
        for (const [releaseId, trackIds] of byRelease) {
          await pushDistributionToVault(supabase, {
            releaseId,
            writeDates: false,
            bumpCatalog: false,
            trackIds,
          })
        }
      } catch (err) {
        console.warn('[isrc/bulk-assign] vault write-back failed', err)
      }
    }

    await logActivity({
      actionType: 'bulk_assign_isrc',
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
    const message = error instanceof Error ? error.message : 'Bulk ISRC failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
