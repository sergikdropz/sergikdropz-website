import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { applyMarketingCopyFromDna } from '@/lib/studio/vault-import-server'
import { logActivity } from '@/lib/activity-log'

/**
 * POST /api/studio/releases/[id]/copy-from-dna
 * Build marketing copy from vault / Sonic DNA. persist=false returns a draft for Copywriting Studio.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const fillEmptyOnly = Boolean(body?.fillEmptyOnly)
    const persist = Boolean(body?.apply || body?.persist)

    const supabase = createSupabaseServerClient()
    const result = await applyMarketingCopyFromDna(supabase, params.id, {
      fillEmptyOnly,
      persist,
    })

    if (persist) {
      await logActivity({
        actionType: 'copy_from_dna',
        resourceType: 'release',
        resourceId: params.id,
        details: { fillEmptyOnly, title: result.input.title },
      })
    }

    return NextResponse.json({
      copy: result.copy,
      generated: result.generated,
      input: result.input,
      applied: persist,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build copy from DNA'
    const status = message === 'Release not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
