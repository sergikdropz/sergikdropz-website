import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  normalizeIdempotencyKey,
} from '@/lib/auth/idempotency'
import { requireSupabaseService } from '../../../nurturing/supabase-service'
import { RELEASE_CAMPAIGN_TEMPLATE } from '@/lib/campaign-builder'
import fs from 'fs'
import path from 'path'

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'release-schedule.json')

function readSchedule(): { schedule: any[] } {
  const raw = fs.readFileSync(SCHEDULE_PATH, 'utf-8')
  return JSON.parse(raw)
}

/**
 * POST /api/studio/release-pipeline/launch
 * Idempotent launch of campaign + smart-link with partial-success reporting.
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

    const { schedule } = readSchedule()
    const release = schedule.find((r) => r.id === releaseId)
    if (!release) {
      return NextResponse.json({ error: 'Release not found in schedule' }, { status: 404 })
    }

    const supabaseService = requireSupabaseService()
    if (!supabaseService.ok) return supabaseService.response
    const supabase = supabaseService.supabase

    const results: Record<string, unknown> = {}
    const errors: string[] = []

    if (createCampaign) {
      const { data: existingCampaign } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('release_id', releaseId)
        .limit(1)

      if (existingCampaign && existingCampaign.length > 0) {
        results.campaign = { ...existingCampaign[0], reused: true }
      } else {
        const { data, error } = await supabase
          .from('campaigns')
          .insert([
            {
              name: `${release.title} - Release Campaign`,
              release_id: releaseId,
              description: RELEASE_CAMPAIGN_TEMPLATE.description,
              scheduled_send_at: release.release_date,
              status: 'draft',
              created_by: auth.session.user.id,
            },
          ])
          .select('id, name, status')

        if (error || !data?.[0]) {
          errors.push(error?.message || 'Failed to create campaign')
        } else {
          results.campaign = { ...data[0], reused: false }
        }
      }
    }

    if (createSmartLink) {
      const { data: existingLink } = await supabase
        .from('smartlinks')
        .select('id, slug, total_clicks')
        .eq('release_id', releaseId)
        .limit(1)

      if (existingLink && existingLink.length > 0) {
        results.smart_link = { ...existingLink[0], reused: true }
      } else {
        const slug = `presave-${releaseId}`
        const destinationUrl =
          release.smart_link || `https://sergikdropz.com/music/${releaseId}`
        const { data, error } = await supabase
          .from('smartlinks')
          .insert([
            {
              slug,
              title: `Pre-save: ${release.title}`,
              destination_url: destinationUrl,
              category: 'release',
              release_id: releaseId,
              description: '',
              metadata: {},
              created_by: auth.session.user.id,
            },
          ])
          .select('id, slug, total_clicks')

        if (error || !data?.[0]) {
          if (error?.code === '23505') {
            errors.push('Smart link slug already exists')
          } else {
            errors.push(error?.message || 'Failed to create smart link')
          }
        } else {
          results.smart_link = { ...data[0], reused: false }
        }
      }
    }

    const partial = errors.length > 0
    const responseBody = {
      success: !partial,
      partial,
      results,
      errors: errors.length ? errors : undefined,
      release_id: releaseId,
    }

    await completeIdempotentOperation({
      adminId: auth.session.user.id,
      operation: 'studio.release-pipeline.launch',
      key: idempotencyKey,
      status: partial ? 'failed' : 'completed',
      response: responseBody,
    })

    return NextResponse.json(responseBody, { status: partial ? 207 : 200 })
  } catch (error: any) {
    console.error('Error launching release pipeline:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to launch release pipeline' },
      { status: 500 }
    )
  }
}
