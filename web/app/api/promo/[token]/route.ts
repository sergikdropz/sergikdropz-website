import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { promoBilledArtistByTrackId, promoLibraryMetaByTrackId, promoPlaybackUrlByTrackId } from '@/lib/studio/promo-track-audio'
import { artworkSrcForCanvas } from '@/lib/media/canvas-artwork-load'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { mergeMarketingCopyFields, readMarketingCopy } from '@/lib/studio/constants'
import {
  parseSocialPromoPlan,
  readPromoShareToken,
  summarizeSocialPromo,
  type SocialPromoPost,
} from '@/lib/studio/social-promo'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

function publicPost(post: SocialPromoPost): SocialPromoPost {
  return { ...post, meta_id: null, meta_error: null }
}

/**
 * GET /api/promo/[token]
 * Collaborator view of a promo schedule. Meta account connection is not included.
 */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { token: raw } = await context.params
    const token = readPromoShareToken(decodeURIComponent(raw || ''))
    if (!token) return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitAsync(`promo-share:${ip}`, 60, 60_000)
    if (!rl.ok) return NextResponse.json({ error: 'Rate limit' }, { status: 429 })

    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select(
        'id, title, type, genre, subgenre, description, label_name, language, album_artist, release_date, artwork_url, artwork_dsp_url, marketing_copy, social_promo'
      )
      .eq('social_promo->>share_token', token)
      .maybeSingle()

    if (error) {
      if (/social_promo/i.test(error.message || '')) {
        return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!release) return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })

    const plan = parseSocialPromoPlan(release.social_promo)
    if (plan.share_token !== token) {
      return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })
    }

    const marketing =
      release.marketing_copy && typeof release.marketing_copy === 'object'
        ? (release.marketing_copy as Record<string, unknown>)
        : {}
    const rawArt = String(release.artwork_url || release.artwork_dsp_url || marketing.artwork_dsp_url || '').trim() || null
    type PromoTrackRow = {
      id: any
      title: any
      wav_url: any
      preview_start_seconds: any
      track_number: any
      contributors: any
      music_library_track_id?: any
    }
    let trackQuery: { data: PromoTrackRow[] | null; error: { message?: string } | null } = await supabase
      .from('distribution_tracks')
      .select('id, title, wav_url, preview_start_seconds, track_number, music_library_track_id, contributors')
      .eq('release_id', release.id)
      .order('track_number', { ascending: true })
    if (trackQuery.error && /music_library_track_id/i.test(trackQuery.error.message || '')) {
      trackQuery = await supabase
        .from('distribution_tracks')
        .select('id, title, wav_url, preview_start_seconds, track_number, contributors')
        .eq('release_id', release.id)
        .order('track_number', { ascending: true })
    }
    const tracks = (trackQuery.data || []).map((track) => ({
      ...track,
      music_library_track_id:
        'music_library_track_id' in track ? track.music_library_track_id : null,
    }))
    const playback = await promoPlaybackUrlByTrackId(supabase, tracks)
    const billedArtists = await promoBilledArtistByTrackId(
      supabase,
      tracks,
      typeof release.album_artist === 'string' ? release.album_artist : 'SERGIK',
    )
    const libraryMeta = await promoLibraryMetaByTrackId(supabase, tracks)

    return NextResponse.json({
      shared: true,
      release: {
        title: release.title,
        type: release.type,
        genre: release.genre,
        subgenre: release.subgenre,
        description: release.description,
        label_name: release.label_name,
        language: release.language,
        album_artist: release.album_artist,
        release_date: release.release_date,
        artwork_url: rawArt,
        artwork_resolved: rawArt ? artworkSrcForCanvas(rawArt) || null : null,
      },
      marketing_copy: readMarketingCopy(release.marketing_copy),
      tracks: (tracks || []).map((track) => ({
        id: track.id,
        title: track.title,
        track_number: track.track_number,
        contributors: track.contributors,
        wav_url: playback.get(track.id) || track.wav_url,
        preview_start_seconds: track.preview_start_seconds,
        music_library_track_id: track.music_library_track_id ?? null,
        bpm: libraryMeta.get(track.id)?.bpm ?? null,
        duration_seconds: libraryMeta.get(track.id)?.durationSec ?? null,
        artist: billedArtists.get(track.id) || release.album_artist || 'SERGIK',
      })),
      plan: { ...plan, share_token: null, posts: plan.posts.map(publicPost) },
      summary: summarizeSocialPromo(plan),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load promo schedule'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Save elevator pitch and the other copy fields. Delivery keys on the release stay put. */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const { token: raw } = await context.params
    const token = readPromoShareToken(decodeURIComponent(raw || ''))
    if (!token) return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimitAsync(`promo-share-copy:${ip}`, 30, 60_000)
    if (!rl.ok) return NextResponse.json({ error: 'Rate limit' }, { status: 429 })

    const body = (await request.json().catch(() => ({}))) as { marketing_copy?: unknown }
    const supabase = createSupabaseServerClient()
    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, marketing_copy, social_promo')
      .eq('social_promo->>share_token', token)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!release) return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })
    const plan = parseSocialPromoPlan(release.social_promo)
    if (plan.share_token !== token) {
      return NextResponse.json({ error: 'Promo link not found' }, { status: 404 })
    }

    const marketing_copy = mergeMarketingCopyFields(release.marketing_copy, body.marketing_copy)
    const { error: saveError } = await supabase
      .from('distribution_releases')
      .update({ marketing_copy, updated_at: new Date().toISOString() })
      .eq('id', release.id)
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
    return NextResponse.json({ marketing_copy: readMarketingCopy(marketing_copy) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save copy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
