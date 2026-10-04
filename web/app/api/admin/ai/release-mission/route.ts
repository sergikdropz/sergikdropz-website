import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { fetchReleaseStudioSnapshot } from '@/lib/studio/release-snapshot'
import { buildReleaseSnapshotAdminAiBrief } from '@/lib/studio/release-snapshot-admin-ai'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ai/release-mission?releaseId=
 * Compact mission-control payload for the Admin AI studio strip.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const releaseId = request.nextUrl.searchParams.get('releaseId')?.trim()
    if (!releaseId) {
      return NextResponse.json({ error: 'releaseId is required' }, { status: 400 })
    }

    const snapshot = await fetchReleaseStudioSnapshot(releaseId)
    const brief = buildReleaseSnapshotAdminAiBrief(snapshot)
    const copyright = snapshot.copyright as Record<string, unknown> | null
    const nextBest = copyright?.next_best_action as { label?: string; kind?: string } | undefined
    const blockers = Array.isArray(copyright?.blockers)
      ? (copyright!.blockers as string[]).filter(Boolean)
      : []
    const ingest = copyright?.ingest as { issues?: Array<{ id?: string; label?: string; hard?: boolean }> } | undefined
    const blockerIssues = Array.isArray(ingest?.issues)
      ? ingest!.issues
          .filter((issue) => issue?.hard && issue.label)
          .map((issue) => ({ id: String(issue.id || ''), label: String(issue.label) }))
      : []

    return NextResponse.json({
      releaseId,
      title: String(snapshot.release.title || 'Untitled'),
      distributorStatus: String(snapshot.release.distributor_status || ''),
      releaseDate: snapshot.release.release_date ?? null,
      readinessScore:
        typeof copyright?.readiness_score === 'number' ? copyright.readiness_score : null,
      nextAction: nextBest?.label ?? null,
      nextActionKind: nextBest?.kind ?? null,
      blockers,
      blockerIssues,
      emptyMarketingCount: brief.emptyMarketingFields.length,
      partialMarketingCount: brief.partialMarketingFields.length,
      sonicDnaUnified: brief.sonicDnaUnified,
      timestampsComplete: brief.timestampFacts.complete,
      copyDeskNote: brief.copyDesk.note.slice(0, 280),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Mission load failed'
    const status = message === 'Release not found' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
