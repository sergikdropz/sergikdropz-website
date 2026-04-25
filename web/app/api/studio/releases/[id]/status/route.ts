import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createRevelatorClient } from '@/lib/studio/distributor'

/**
 * GET /api/studio/releases/[id]/status
 * Poll distribution status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    // Get release
    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('*')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json(
        { error: 'Release not found' },
        { status: 404 }
      )
    }

    if (!release.distributor_release_id) {
      return NextResponse.json({
        status: release.distributor_status || 'draft',
        stores: [],
      })
    }

    // Create distributor client
    const distributor = createRevelatorClient()
    if (!distributor) {
      return NextResponse.json(
        { error: 'Distributor API not configured' },
        { status: 500 }
      )
    }

    // Get status from distributor
    const status = await distributor.getStatus(release.distributor_release_id)

    // Update release status if changed
    if (status.status !== release.distributor_status) {
      await supabase
        .from('distribution_releases')
        .update({ distributor_status: status.status })
        .eq('id', params.id)
    }

    // Update store links if status is live
    if (status.status === 'live' && status.stores.length > 0) {
      for (const store of status.stores) {
        if (store.url) {
          // Check if link already exists
          const { data: existing } = await supabase
            .from('distribution_store_links')
            .select('id')
            .eq('release_id', params.id)
            .eq('store', store.name)
            .single()

          if (!existing) {
            await supabase
              .from('distribution_store_links')
              .insert({
                id: `${params.id}-${store.name}-${Date.now()}`,
                release_id: params.id,
                store: store.name,
                url: store.url,
                verified_at: new Date().toISOString(),
              })
          }
        }
      }
    }

    return NextResponse.json(status)
  } catch (error: any) {
    console.error('Error checking distribution status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    )
  }
}
