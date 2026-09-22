import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness, seedCopyrightChecklistDefaults } from '@/lib/studio/copyright-pipeline'
import { autoCreateReleaseCampaign } from '@/lib/studio/auto-campaign'
import { getLaunchHandoffStatus } from '@/lib/studio/launch-handoff'
import { upsertScheduleFromDistribution } from '@/lib/studio/schedule-bridge'
import { enrichDistributionTracksWithVaultIdentity } from '@/lib/studio/vault-import-server'
import {
  buildReleasePackageSeeds,
  parseAppleMusicArtistId,
  parseFacebookPage,
  parseInstagramHandle,
  parseSpotifyArtistId,
  parseYoutubeChannelId,
} from '@/lib/studio/dsp-package'
import { generateInternalUpc } from '@/lib/studio/upc'
import { artistPlatformUrl } from '@/lib/artist-platforms'
import { coerceTriStateBoolean, mapSonicGenreToDsp, mergeAttestations } from '@/lib/studio/dsp-ingest'
import { validateISRC } from '@/lib/studio/isrc-format'
import { hydrateRightsPacket } from '@/lib/studio/rights-ops'

/**
 * GET /api/studio/releases/[id]
 * Get a single release with tracks
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

    const packageSeeds = buildReleasePackageSeeds(release as Record<string, unknown>, {
      upc: generateInternalUpc(),
      spotifyArtistId: artistPlatformUrl('spotify'),
      appleArtistId: artistPlatformUrl('apple_music'),
      youtubeArtistId: artistPlatformUrl('youtube_music') || artistPlatformUrl('youtube'),
      instagramHandle: artistPlatformUrl('instagram'),
      facebookPageId: artistPlatformUrl('facebook'),
    })
    const mappedGenre = mapSonicGenreToDsp(
      (release as { genre?: string | null }).genre,
      (release as { subgenre?: string | null }).subgenre,
    )
    if (mappedGenre.mapped && mappedGenre.primary) {
      packageSeeds.genre = mappedGenre.primary
      packageSeeds.subgenre = mappedGenre.secondary || null
    }
    if (Object.keys(packageSeeds).length) {
      const ingestKeys = ['youtube_artist_id', 'instagram_handle', 'facebook_page_id'] as const
      const ingestSeed: Record<string, unknown> = {}
      const coreSeed: Record<string, unknown> = { ...packageSeeds }
      for (const key of ingestKeys) {
        if (key in coreSeed) {
          ingestSeed[key] = coreSeed[key]
          delete coreSeed[key]
        }
      }
      if (Object.keys(coreSeed).length) {
        const { data: seeded, error: seedError } = await supabase
          .from('distribution_releases')
          .update(coreSeed)
          .eq('id', params.id)
          .select('*')
          .single()
        if (!seedError && seeded) Object.assign(release, seeded)
      }
      if (Object.keys(ingestSeed).length) {
        const { data: seeded, error: seedError } = await supabase
          .from('distribution_releases')
          .update(ingestSeed)
          .eq('id', params.id)
          .select('*')
          .single()
        if (!seedError && seeded) Object.assign(release, seeded)
      }
    }

    // Get tracks for this release
    const { data: tracks } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('release_id', params.id)
      .order('created_at', { ascending: true })

    // Get store links
    const { data: storeLinks } = await supabase
      .from('distribution_store_links')
      .select('*')
      .eq('release_id', params.id)

    const [copyrightRaw, handoff, enrichedTracks] = await Promise.all([
      getSingleReleaseCopyrightReadiness(supabase, params.id),
      getLaunchHandoffStatus(supabase, params.id),
      enrichDistributionTracksWithVaultIdentity(supabase, (tracks || []) as Array<Record<string, unknown>>),
    ])
    const copyright = await seedCopyrightChecklistDefaults(supabase, params.id, copyrightRaw, {
      ownerName: session.user?.email || session.user?.user_metadata?.full_name || null,
      albumArtist:
        (release as { album_artist?: string | null }).album_artist ||
        (release as { label_name?: string | null }).label_name ||
        null,
    })

    return NextResponse.json({
      release,
      tracks: enrichedTracks.map((track) => hydrateRightsPacket(track as Record<string, unknown>)),
      storeLinks: storeLinks || [],
      copyright,
      handoff,
    })
  } catch (error: any) {
    console.error('Error in GET /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch release' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/studio/releases/[id]
 * Update a release
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = createSupabaseServerClient()

    // Fetch current release so we can detect status transitions.
    const { data: currentRelease, error: fetchError } = await supabase
      .from('distribution_releases')
      .select('distributor_status')
      .eq('id', params.id)
      .single()

    if (fetchError || !currentRelease) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const previousStatus: string = currentRelease.distributor_status ?? 'draft'

    const allowed = [
      'title',
      'type',
      'release_date',
      'original_release_date',
      'artwork_url',
      'artwork_dsp_url',
      'description',
      'explicit',
      'genre',
      'subgenre',
      'label_name',
      'album_artist',
      'catalog_number',
      'p_line_year',
      'c_line_year',
      'upc',
      'spotify_artist_id',
      'apple_artist_id',
      'youtube_artist_id',
      'instagram_handle',
      'facebook_page_id',
      'previously_released',
      'previous_isrc',
      'previous_upc',
      'language',
      'ingest_attestations',
      'artwork_owned',
      'artwork_designer',
      'artwork_photographer',
      'artwork_illustrator',
      'distribution_mode',
      'target_stores',
      'marketing_copy',
      'status',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (!(key in body)) continue
      if (key === 'status') {
        updates['distributor_status'] = body[key]
        continue
      }
      if (key === 'p_line_year' || key === 'c_line_year') {
        const year = Number(body[key])
        updates[key] = Number.isFinite(year) && year >= 1900 ? year : null
        continue
      }
      if (key === 'original_release_date' || key === 'release_date') {
        updates[key] = body[key] ? body[key] : null
        continue
      }
      if (key === 'spotify_artist_id') {
        updates[key] = parseSpotifyArtistId(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'apple_artist_id') {
        updates[key] = parseAppleMusicArtistId(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'youtube_artist_id') {
        updates[key] = parseYoutubeChannelId(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'instagram_handle') {
        updates[key] = parseInstagramHandle(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'facebook_page_id') {
        updates[key] = parseFacebookPage(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'previously_released') {
        updates[key] = coerceTriStateBoolean(body[key])
        continue
      }
      if (key === 'artwork_owned') {
        updates[key] = Boolean(body[key])
        continue
      }
      if (
        key === 'artwork_designer' ||
        key === 'artwork_photographer' ||
        key === 'artwork_illustrator'
      ) {
        const raw = body[key] == null ? '' : String(body[key]).trim()
        updates[key] = raw || null
        continue
      }
      if (key === 'previous_isrc') {
        const raw = body[key] ? String(body[key]).trim() : ''
        updates[key] = raw && validateISRC(raw) ? raw.replace(/-/g, '').toUpperCase() : raw || null
        continue
      }
      if (key === 'previous_upc' || key === 'language') {
        updates[key] = body[key] ? String(body[key]).trim() : null
        continue
      }
      if (key === 'ingest_attestations') {
        updates[key] = mergeAttestations({}, body[key])
        continue
      }
      updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating release:', error)
      const missingIngest =
        /previously_released|ingest_attestations|youtube_artist_id|instagram_handle|facebook_page_id|artwork_owned|artwork_designer|artwork_photographer|artwork_illustrator/i.test(
          error.message || '',
        )
      return NextResponse.json(
        {
          error: missingIngest
            ? 'Run web/supabase/migrations/add_dsp_ingest_fields.sql and add_artwork_credits.sql so artwork/DSP fields can save.'
            : error.message || 'Failed to update release',
        },
        { status: 500 }
      )
    }

    // Auto-create a draft campaign when a release transitions to "scheduled".
    // Fire-and-forget: never block the response on campaign creation.
    const newStatus: string = (data as { distributor_status?: string }).distributor_status ?? previousStatus
    if (newStatus === 'scheduled' && previousStatus !== 'scheduled') {
      void autoCreateReleaseCampaign(supabase, data as { id: string; title: string; release_date?: string | null })
    }

    // Keep calendar/pipeline in sync when date or live-facing fields change.
    if (
      'release_date' in updates ||
      'title' in updates ||
      'artwork_url' in updates ||
      'genre' in updates ||
      'status' in body ||
      newStatus === 'live'
    ) {
      try {
        upsertScheduleFromDistribution(data as {
          id: string
          title: string
          type?: string | null
          release_date?: string | null
          artwork_url?: string | null
          genre?: string | null
          description?: string | null
          distributor_status?: string | null
        })
      } catch (err) {
        console.warn('[release PUT] schedule bridge failed', err)
      }
    }

    return NextResponse.json({ release: data })
  } catch (error: any) {
    console.error('Error in PUT /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update release' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/studio/releases/[id]
 * Delete a release
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { error } = await supabase
      .from('distribution_releases')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting release:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete release' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/studio/releases/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete release' },
      { status: 500 }
    )
  }
}
