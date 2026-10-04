import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { runIntelligenceHarness } from '@/lib/ai/intelligence-harness-server'
import { checkRateLimitAsync } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** POST — lightweight harness stack probe for Release Studio Copy (no ai_runs row). */
export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`admin-ai-intel-stack:${session.user.id}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    releaseId?: string
    query?: string
  }

  try {
    const stack = await runIntelligenceHarness({
      mode: 'stack',
      releaseId: body.releaseId?.trim(),
      query:
        body.query?.trim() ||
        'Sonic DNA unified intelligence Release Studio marketing copy polymath',
    })
    return NextResponse.json(stack)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Intelligence stack failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
