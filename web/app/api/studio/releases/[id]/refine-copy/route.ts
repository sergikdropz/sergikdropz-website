import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  refineAllMarketingCopyFields,
  refineMarketingCopyField,
} from '@/lib/studio/refine-marketing-copy-server'
import { isMarketingCopyField } from '@/lib/studio/refine-marketing-copy'

/**
 * POST /api/studio/releases/[id]/refine-copy
 * AI-polish one marketing copy field (or all) and return text for Copywriting Studio.
 * Body: { field?: keyof MarketingCopy, draft?: string, all?: boolean, useAi?: boolean }
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
    const useAi = body?.useAi !== false
    const supabase = createSupabaseServerClient()

    if (body?.all === true) {
      const result = await refineAllMarketingCopyFields(supabase, params.id, {
        drafts: body?.drafts && typeof body.drafts === 'object' ? body.drafts : undefined,
        useAi,
      })
      return NextResponse.json({
        copy: result.copy,
        sources: result.sources,
        all: true,
      })
    }

    const field = String(body?.field || '').trim()
    if (!isMarketingCopyField(field)) {
      return NextResponse.json(
        { error: 'field is required (elevator_pitch, press_blurb, …)' },
        { status: 400 },
      )
    }

    const result = await refineMarketingCopyField(supabase, params.id, {
      field,
      draft: typeof body?.draft === 'string' ? body.draft : null,
      useAi,
    })

    return NextResponse.json({
      field: result.field,
      text: result.text,
      source: result.source,
      all: false,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to refine copy'
    const status = message === 'Release not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
