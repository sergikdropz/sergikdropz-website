import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  normalizeIdempotencyKey,
} from '@/lib/auth/idempotency'
import { requireSupabaseService } from '../../../nurturing/supabase-service'
import { ensureLaunchHandoff, publicMusicDestinationUrl } from '@/lib/studio/launch-handoff'
import { resolvePipelineRelease } from '@/lib/studio/schedule-bridge'

/**
 * POST /api/studio/release-pipeline/launch
 * Idempotent launch of campaign + smart-link (schedule or distribution release).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const releaseId = typeof body.release_id === 'string' ? body.release_id : ''
    const createCampaign = body.create_campaign !== false
    const createSmartLink = body.create_smart_link !== false
    const headerKey = normalizeIdempotencyKey(request.headers.get('Idempotency-Key'))
    const bodyKey = normalizeIdempotencyKey(
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null
    )
    const idempotencyKey = headerKey || bodyKey || `launch:${releaseId}`

    if (!releaseId) {
      return NextResponse.json({ error: 'release_id is required' }, { status: 400 })
    }

    const { existing } = await beginIdempotentOperation({
      adminId: auth.session.user.id,
      operation: 'studio.release-pipeline.launch',
      key: idempotencyKey,
    })
    if (existing?.status === 'completed' && existing.response) {
      return NextResponse.json(existing.response)
    }
    if (existing?.status === 'pending') {
      return NextResponse.json(
        { error: 'Launch already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' },
        { status: 409 }
      )
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const release = await resolvePipelineRelease(supabase, releaseId)
    if (!release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const handoff = await ensureLaunchHandoff(supabase, {
      releaseId,
      title: release.title,
      releaseDate: release.release_date || null,
      destinationUrl: release.smart_link || publicMusicDestinationUrl(releaseId),
      createdBy: auth.session.user.id,
      createCampaign,
      createSmartLink,
    })

    const results: Record<string, unknown> = {}
    if (handoff.campaign) results.campaign = handoff.campaign
    if (handoff.smartLink) results.smart_link = handoff.smartLink

    const partial = handoff.errors.length > 0
    const responseBody = {
      success: !partial,
      partial,
      results,
      errors: handoff.errors.length ? handoff.errors : undefined,
      release_id: releaseId,
      source: release.source,
    }

    await completeIdempotentOperation({
      adminId: auth.session.user.id,
      operation: 'studio.release-pipeline.launch',
      key: idempotencyKey,
      status: partial ? 'failed' : 'completed',
      response: responseBody,
    })

    return NextResponse.json(responseBody, { status: partial ? 207 : 200 })
  } catch (error: unknown) {
    console.error('Error launching release pipeline:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to launch release pipeline'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
