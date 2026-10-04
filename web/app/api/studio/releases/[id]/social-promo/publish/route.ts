import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { publishReleaseToMeta } from '@/lib/meta/publish-release'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as {
    mode?: string
    post_id?: string
  }
  const mode = body.mode === 'now' ? 'now' : 'due'
  const postId = typeof body.post_id === 'string' ? body.post_id : null
  if (mode === 'now' && !postId) {
    return NextResponse.json({ error: 'post_id is required to publish one slot now' }, { status: 400 })
  }

  const result = await publishReleaseToMeta({ releaseId: id, mode, postId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({
    plan: result.plan,
    summary: result.summary,
    results: result.results,
  })
}
