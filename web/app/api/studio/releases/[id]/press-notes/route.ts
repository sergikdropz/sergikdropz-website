import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { createSupabaseServerClient } from '@/lib/supabase'
import { writeAiPressNotesForRelease } from '@/lib/studio/release-press-note-server'
import { logActivity } from '@/lib/activity-log'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/studio/releases/[id]/press-notes
 * AI listen (Sonic DNA + optional lyric transcription) → journalist press notes per track.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const rl = await checkRateLimitAsync(`press-notes:${auth.session.user.id}`, 8, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Press-note rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    const trackId = typeof body.trackId === 'string' ? body.trackId.trim() : ''
    const listen = body.listen !== false

    const supabase = createSupabaseServerClient()
    const result = await writeAiPressNotesForRelease(supabase, params.id, {
      trackId: trackId || null,
      listen,
    })

    await logActivity({
      actionType: 'write_press_notes',
      resourceType: 'release',
      resourceId: params.id,
      details: { trackId: trackId || null, listen, count: result.count },
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to write press notes'
    const status = message === 'Release not found' || message === 'No tracks to write' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
