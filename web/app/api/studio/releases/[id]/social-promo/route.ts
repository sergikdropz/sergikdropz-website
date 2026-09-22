import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  generateSocialPromoPlan,
  mergeSocialPromoPlan,
  parseSocialPromoPlan,
  summarizeSocialPromo,
} from '@/lib/studio/social-promo'

type Ctx = { params: Promise<{ id: string }> }

function missingColumn(message: string) {
  return /social_promo/i.test(message)
}

async function loadReleaseBundle(releaseId: string) {
  const supabase = createSupabaseServerClient()
  let columnMissing = false
  let release: Record<string, unknown> | null = null

  const { data, error } = await supabase
    .from('distribution_releases')
    .select(
      'id, title, album_artist, release_date, artwork_url, marketing_copy, social_promo, distributor_status'
    )
    .eq('id', releaseId)
    .maybeSingle()

  if (error) {
    if (missingColumn(error.message)) {
      columnMissing = true
      const fallback = await supabase
        .from('distribution_releases')
        .select('id, title, album_artist, release_date, artwork_url, marketing_copy, distributor_status')
        .eq('id', releaseId)
        .maybeSingle()
      if (fallback.error) return { error: fallback.error.message }
      if (!fallback.data) return { error: 'Release not found', status: 404 as const }
      release = { ...fallback.data, social_promo: null }
    } else {
      return { error: error.message }
    }
  } else if (!data) {
    return { error: 'Release not found', status: 404 as const }
  } else {
    release = data
  }

  const [{ data: tracks }, { data: smart }] = await Promise.all([
    supabase
      .from('distribution_tracks')
      .select('id, title, wav_url, preview_start_seconds, track_number, music_library_track_id')
      .eq('release_id', releaseId)
      .order('track_number', { ascending: true }),
    supabase.from('smartlinks').select('slug').eq('release_id', releaseId).maybeSingle(),
  ])

  // Soft-fail track select if optional columns are missing.
  let trackRows = tracks || []
  if (!tracks) {
    const retry = await supabase
      .from('distribution_tracks')
      .select('id, title, wav_url, preview_start_seconds, track_number')
      .eq('release_id', releaseId)
      .order('track_number', { ascending: true })
    trackRows = (retry.data || []).map((t) => ({ ...t, music_library_track_id: null }))
  }

  return {
    release,
    tracks: trackRows,
    smartSlug: smart?.slug || null,
    columnMissing,
  }
}

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const bundle = await loadReleaseBundle(id)
    if ('error' in bundle && bundle.error) {
      return NextResponse.json(
        { error: bundle.error },
        { status: 'status' in bundle && bundle.status ? bundle.status : 500 }
      )
    }

    const release = bundle.release!
    const plan = parseSocialPromoPlan(release.social_promo)
    const marketingCopy =
      release.marketing_copy && typeof release.marketing_copy === 'object'
        ? (release.marketing_copy as { social_caption?: string })
        : {}

    return NextResponse.json({
      release: {
        id: release.id,
        title: release.title,
        album_artist: release.album_artist,
        release_date: release.release_date,
        artwork_url: release.artwork_url,
        distributor_status: release.distributor_status,
        social_caption: marketingCopy.social_caption || null,
      },
      smart_link: bundle.smartSlug ? `/l/${bundle.smartSlug}` : null,
      tracks: (bundle.tracks || []).map((t) => ({
        id: t.id,
        title: t.title,
        wav_url: t.wav_url,
        preview_start_seconds: t.preview_start_seconds,
        music_library_track_id: t.music_library_track_id ?? null,
      })),
      plan,
      summary: summarizeSocialPromo(plan),
      column_missing: bundle.columnMissing,
      migration_hint: bundle.columnMissing
        ? 'Apply web/supabase/migrations/add_social_promo_to_releases.sql'
        : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load social promo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const supabase = createSupabaseServerClient()

    const { data: current, error: loadError } = await supabase
      .from('distribution_releases')
      .select('id, title, album_artist, release_date, marketing_copy, social_promo')
      .eq('id', id)
      .maybeSingle()

    if (loadError) {
      if (missingColumn(loadError.message)) {
        return NextResponse.json(
          {
            error: 'social_promo column missing',
            hint: 'Apply web/supabase/migrations/add_social_promo_to_releases.sql',
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: loadError.message }, { status: 500 })
    }
    if (!current) return NextResponse.json({ error: 'Release not found' }, { status: 404 })

    let plan = parseSocialPromoPlan(current.social_promo)
    const marketingCopy =
      current.marketing_copy && typeof current.marketing_copy === 'object'
        ? (current.marketing_copy as { social_caption?: string })
        : {}

    if (body.generate === true || body.regenerate === true) {
      const { data: smart } = await supabase
        .from('smartlinks')
        .select('slug')
        .eq('release_id', id)
        .maybeSingle()
      const site =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://sergikdropz.com'
      plan = generateSocialPromoPlan({
        streetDate:
          typeof body.street_date === 'string' ? body.street_date : current.release_date,
        title: current.title,
        artist: current.album_artist || 'SERGIK',
        socialCaption: marketingCopy.social_caption || null,
        smartLink: smart?.slug ? `${site}/l/${smart.slug}` : null,
      })
    } else if (body.plan) {
      plan = mergeSocialPromoPlan(plan, body.plan)
    } else if (body.post && typeof body.post === 'object') {
      plan = mergeSocialPromoPlan(plan, { posts: [body.post] })
    }

    const { data, error } = await supabase
      .from('distribution_releases')
      .update({ social_promo: plan, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, social_promo')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const saved = parseSocialPromoPlan(data?.social_promo)
    return NextResponse.json({ plan: saved, summary: summarizeSocialPromo(saved) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save social promo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
