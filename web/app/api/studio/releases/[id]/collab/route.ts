import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  listCollaborators,
  listEmailSends,
  listMessages,
  listReviews,
  loadReleaseCollabContext,
} from '@/lib/studio/release-collab-server'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { collaboratorsFromPartyContacts } from '@/lib/studio/release-collab'
import { loadCollabPromoSnippets } from '@/lib/studio/collab-promo-snippets'

export const dynamic = 'force-dynamic'

/**
 * GET /api/studio/releases/[id]/collab
 * Bundle: collaborators, messages, reviews, email sends, rights contact seeds.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServerClient()
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select('id,title,artwork_url,album_artist,release_date,distributor_status')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !release) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  }

  const [collaborators, messages, sends, reviews, readiness, contextResult] = await Promise.all([
    listCollaborators(params.id),
    listMessages(params.id),
    listEmailSends(params.id),
    listReviews(params.id),
    getSingleReleaseCopyrightReadiness(supabase, params.id),
    loadReleaseCollabContext(params.id),
  ])

  for (const part of [collaborators, messages, sends, reviews]) {
    if ('code' in part) {
      return NextResponse.json(part, { status: 503 })
    }
    if ('error' in part) {
      return NextResponse.json({ error: part.error }, { status: 500 })
    }
  }

  const context =
    contextResult && !('code' in contextResult) && !('error' in contextResult)
      ? contextResult
      : null

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (typeof request.url === 'string' ? new URL(request.url).origin : '')
  const promoSnippets = await loadCollabPromoSnippets(params.id, origin)

  return NextResponse.json({
    release: {
      id: release.id,
      title: release.title,
      artworkUrl: release.artwork_url,
      albumArtist: release.album_artist,
      releaseDate: release.release_date,
      distributorStatus: release.distributor_status,
    },
    collaborators: 'collaborators' in collaborators ? collaborators.collaborators : [],
    messages: 'messages' in messages ? messages.messages : [],
    sends: 'sends' in sends ? sends.sends : [],
    reviews: 'reviews' in reviews ? reviews.reviews : [],
    rightsContactSeeds: collaboratorsFromPartyContacts(readiness?.party_contacts),
    context,
    promoSnippets,
  })
}
