import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { linkDspMastersForRelease } from '@/lib/studio/link-dsp-masters-server'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/studio/releases/[id]/locate-masters
 * Auto-link tracks to audio/dsp-masters/… in R2. Returns which tracks still need a user-picked WAV.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'Missing release id' }, { status: 400 })

    let force = false
    let trackIds: string[] | undefined
    try {
      const body = await request.json()
      force = Boolean(body?.force)
      if (Array.isArray(body?.trackIds)) {
        trackIds = body.trackIds.map((t: unknown) => String(t)).filter(Boolean)
      }
    } catch {
      /* empty body ok */
    }

    const supabase = createSupabaseServerClient()
    const result = await linkDspMastersForRelease(supabase, id, { force, trackIds })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Locate masters failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
