import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { enqueueSonicDnaJob, runSonicDnaJob } from '@/lib/jobs/sonic-dna-job'
import { getJob } from '@/lib/jobs/job-store'

export const dynamic = 'force-dynamic'

/** Enqueue or inspect background AI/audio jobs. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const jobId = new URL(request.url).searchParams.get('id')
  if (!jobId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const job = await getJob(jobId)
  if (!job || job.adminId !== auth.session.user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json({ job })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    type?: string
    trackId?: string
    libraryTrackId?: string
    force?: boolean
    runNow?: boolean
    directive?: string
    skipChallenge?: boolean
    proseOnly?: boolean
  }

  if (body.type !== 'sonic_dna_analyze' || !body.trackId?.trim()) {
    return NextResponse.json(
      {
        error:
          'Supported payload: { type: "sonic_dna_analyze", trackId, libraryTrackId?, force?, runNow?, directive?, skipChallenge?, proseOnly? }',
      },
      { status: 400 },
    )
  }

  const job = await enqueueSonicDnaJob({
    adminId: auth.session.user.id,
    trackId: body.trackId.trim(),
    libraryTrackId: body.libraryTrackId?.trim(),
    force: Boolean(body.force),
    directive: body.directive,
    skipChallenge: body.skipChallenge !== false,
    proseOnly: Boolean(body.proseOnly),
  })

  if (body.runNow) {
    const ran = await runSonicDnaJob(job.id)
    return NextResponse.json({ job: ran ?? job })
  }

  // Background run — client polls GET ?id=
  void runSonicDnaJob(job.id).catch((err) => {
    console.error('[admin/ai/jobs] background run failed', job.id, err)
  })

  return NextResponse.json({ job })
}
