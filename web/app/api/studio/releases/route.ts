import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  normalizeIdempotencyKey,
} from '@/lib/auth/idempotency'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getCopyrightReadinessByReleaseIds } from '@/lib/studio/copyright-pipeline'

/**
 * GET /api/studio/releases
 * List all releases
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter')

    let query = supabase
      .from('distribution_releases')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      query = query.eq('distributor_status', 'draft')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching releases:', error)
      return NextResponse.json(
        { error: 'Failed to fetch releases' },
        { status: 500 }
      )
    }

    const releases = data || []
    const readinessByRelease = await getCopyrightReadinessByReleaseIds(
      supabase,
      releases.map((r) => r.id)
    )
    const enriched = releases.map((r) => ({
      ...r,
      copyright: readinessByRelease[r.id] || null,
    }))

    return NextResponse.json({ releases: enriched })
  } catch (error: any) {
    console.error('Error in GET /api/studio/releases:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/studio/releases
 * Create a new release
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id,
      title,
      type,
      release_date,
      artwork_url,
      description,
      explicit,
      genre,
      subgenre,
      label_name,
      marketing_copy,
      distribution_mode,
      target_stores,
    } = body

    if (!id || !title || !type) {
      return NextResponse.json(
        { error: 'id, title, and type are required' },
        { status: 400 }
      )
    }

    const headerKey = normalizeIdempotencyKey(request.headers.get('Idempotency-Key'))
    const bodyKey = normalizeIdempotencyKey(
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null
    )
    const idempotencyKey = headerKey || bodyKey || `create-release:${id}`

    const { existing } = await beginIdempotentOperation({
      adminId: session.user.id,
      operation: 'studio.releases.create',
      key: idempotencyKey,
    })
    if (existing?.status === 'completed' && existing.response) {
      return NextResponse.json(existing.response, { status: 200 })
    }
    if (existing?.status === 'pending') {
      return NextResponse.json(
        { error: 'Create already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' },
        { status: 409 }
      )
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('distribution_releases')
      .insert({
        id,
        title,
        type,
        release_date: release_date || null,
        artwork_url: artwork_url || null,
        description: description || null,
        explicit: explicit || false,
        genre: genre || null,
        subgenre: subgenre || null,
        label_name: label_name || null,
        marketing_copy: marketing_copy || {},
        distribution_mode: distribution_mode || 'self',
        target_stores: target_stores || [],
        distributor_status: 'draft',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating release:', error)
      await completeIdempotentOperation({
        adminId: session.user.id,
        operation: 'studio.releases.create',
        key: idempotencyKey,
        status: 'failed',
        response: { error: error.message || 'Failed to create release' },
      })
      return NextResponse.json(
        { error: error.message || 'Failed to create release' },
        { status: 500 }
      )
    }

    const responseBody = { release: data }
    await completeIdempotentOperation({
      adminId: session.user.id,
      operation: 'studio.releases.create',
      key: idempotencyKey,
      status: 'completed',
      response: responseBody,
    })

    return NextResponse.json(responseBody, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/studio/releases:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create release' },
      { status: 500 }
    )
  }
}
