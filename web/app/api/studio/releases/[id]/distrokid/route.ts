import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import {
  loadDistroKidRelease,
  persistDistroKidDelivery,
  submittedDistributorId,
} from '@/lib/studio/distrokid-delivery-server'
import type { DistroKidDeliveryRecord } from '@/lib/studio/distrokid-delivery'

/**
 * GET/POST /api/studio/releases/[id]/distrokid
 * Interim DistroKid packet for a scheduled release. Does not call DistroKid.
 */

function albumUuid(value: unknown): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(text)) return null
  return text
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseServerClient()
  const loaded = await loadDistroKidRelease(supabase, params.id)
  if (!loaded.release) {
    return NextResponse.json({ error: loaded.error || 'Release not found' }, { status: loaded.error === 'Release not found' ? 404 : 500 })
  }

  const format = request.nextUrl.searchParams.get('format')
  if (format === 'csv' || format === 'txt') {
    const body = format === 'csv' ? loaded.packet!.csv : loaded.packet!.worksheet
    const ext = format === 'csv' ? 'csv' : 'txt'
    return new NextResponse(body, {
      headers: {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="distrokid-${params.id}.${ext}"`,
      },
    })
  }

  return NextResponse.json({
    pipe: loaded.pipe,
    window: loaded.window,
    packet: loaded.packet,
    record: loaded.record,
    distributorStatus: loaded.release.distributor_status,
    distributionMode: loaded.release.distribution_mode,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseServerClient()
  const loaded = await loadDistroKidRelease(supabase, params.id)
  if (!loaded.release || !loaded.packet) {
    return NextResponse.json({ error: loaded.error || 'Release not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const force = Boolean(body?.force)
  const now = new Date().toISOString()
  const status = String(loaded.release.distributor_status || '')

  if (status === 'live' && action !== 'clear') {
    return NextResponse.json({ error: 'This release is already live.' }, { status: 409 })
  }

  if (action === 'queue') {
    const record: DistroKidDeliveryRecord = {
      status: 'queued',
      queued_at: loaded.record?.queued_at || now,
      albumuuid: loaded.record?.albumuuid || null,
      notes: typeof body?.notes === 'string' ? body.notes.slice(0, 500) : loaded.record?.notes || null,
    }
    const error = await persistDistroKidDelivery(supabase, params.id, loaded.release.marketing_copy, record, {})
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logActivity({
      actionType: 'distrokid_queue',
      resourceType: 'release',
      resourceId: params.id,
      details: { window: loaded.window?.kind },
    })
    return NextResponse.json({ success: true, record, window: loaded.window, pipe: loaded.pipe })
  }

  if (action === 'mark_submitted') {
    if (!loaded.packet.ok && !force) {
      return NextResponse.json(
        { error: 'Release is not ready for DistroKid.', blockers: loaded.packet.blockers },
        { status: 400 },
      )
    }
    if (loaded.pipe?.revelatorLive && !force) {
      return NextResponse.json(
        { error: 'Revelator Partner API is live. Use Distribute to stores instead of DistroKid.' },
        { status: 409 },
      )
    }
    const uuid = albumUuid(body?.albumuuid)
    if (body?.albumuuid && !uuid) {
      return NextResponse.json({ error: 'Album UUID should be the id from the DistroKid release URL.' }, { status: 400 })
    }
    const record: DistroKidDeliveryRecord = {
      status: 'submitted',
      queued_at: loaded.record?.queued_at || now,
      submitted_at: now,
      albumuuid: uuid || loaded.record?.albumuuid || null,
      notes: typeof body?.notes === 'string' ? body.notes.slice(0, 500) : loaded.record?.notes || null,
    }
    const error = await persistDistroKidDelivery(supabase, params.id, loaded.release.marketing_copy, record, {
      distributor_status: 'submitted',
      distributor_release_id: submittedDistributorId(params.id, record.albumuuid),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logActivity({
      actionType: 'distrokid_submitted',
      resourceType: 'release',
      resourceId: params.id,
      details: { albumuuid: record.albumuuid, forced: force },
    })
    return NextResponse.json({ success: true, record, pipe: loaded.pipe })
  }

  if (action === 'mark_live') {
    const { count, error: linkError } = await supabase
      .from('distribution_store_links')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', params.id)
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })
    if (!count && !force) {
      return NextResponse.json(
        { error: 'Connect at least one store page in Delivery before marking DistroKid live.' },
        { status: 400 },
      )
    }
    const error = await persistDistroKidDelivery(supabase, params.id, loaded.release.marketing_copy, loaded.record, {
      distributor_status: 'live',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logActivity({
      actionType: 'distrokid_live',
      resourceType: 'release',
      resourceId: params.id,
      details: { storeLinks: count || 0 },
    })
    return NextResponse.json({ success: true, distributorStatus: 'live' })
  }

  if (action === 'clear') {
    if (status === 'live') {
      return NextResponse.json({ error: 'Live releases stay on the slate. Change status from the release if you need a takedown.' }, { status: 409 })
    }
    const extra: Record<string, unknown> = {}
    const distId = String(loaded.release.distributor_release_id || '')
    if (status === 'submitted' && distId.startsWith('dk-')) {
      extra.distributor_status = 'draft'
      extra.distributor_release_id = null
    }
    const error = await persistDistroKidDelivery(supabase, params.id, loaded.release.marketing_copy, null, extra)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, record: null })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
