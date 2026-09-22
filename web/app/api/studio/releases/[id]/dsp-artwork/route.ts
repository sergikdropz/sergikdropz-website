import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { ensureDspReadyCover, probeArtworkUrl } from '@/lib/studio/artwork-dsp'
import { parseRevelatorDeliveryRights } from '@/lib/studio/revelator-preflight'

/**
 * POST /api/studio/releases/[id]/dsp-artwork
 * Probe site artwork and write a DSP-ready JPEG under
 * gallery-images/studio/release-covers/{id}/dsp-ready.jpg
 * without mutating artwork_url (website quality stays intact).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const force = Boolean(body?.force)
    const supabase = createSupabaseServerClient()

    type ArtRow = {
      id: string
      artwork_url?: string | null
      artwork_dsp_url?: string | null
      marketing_copy?: unknown
    }

    const { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, artwork_url, artwork_dsp_url, marketing_copy')
      .eq('id', params.id)
      .single()

    // Column may not exist until migration — retry without it.
    let row: ArtRow | null = release as ArtRow | null
    if (error && /artwork_dsp_url/i.test(error.message)) {
      const fallback = await supabase
        .from('distribution_releases')
        .select('id, artwork_url, marketing_copy')
        .eq('id', params.id)
        .single()
      if (fallback.error || !fallback.data) {
        return NextResponse.json({ error: 'Release not found' }, { status: 404 })
      }
      row = fallback.data as ArtRow
    } else if (error || !release) {
      return NextResponse.json({ error: error?.message || 'Release not found' }, { status: 404 })
    }

    const sourceUrl = String(body?.sourceUrl || row!.artwork_url || '').trim()
    if (!sourceUrl) {
      return NextResponse.json({ error: 'Set release artwork_url first' }, { status: 400 })
    }

    const prevCopy = (row!.marketing_copy as Record<string, unknown>) || {}
    const nested = prevCopy.revelator_delivery as Record<string, unknown> | undefined
    const existingDsp =
      String(row?.artwork_dsp_url || '').trim() ||
      String(nested?.artwork_dsp_url || '').trim() ||
      String(prevCopy.artwork_dsp_url || '').trim() ||
      null

    const sourceProbe = await probeArtworkUrl(sourceUrl)
    const ensured = await ensureDspReadyCover({
      releaseId: params.id,
      sourceUrl,
      existingDspUrl: existingDsp,
      force,
      supabase,
    })

    const existingRights = parseRevelatorDeliveryRights(row!.marketing_copy)
    const withNested = {
      ...prevCopy,
      artwork_dsp_url: ensured.url,
      revelator_delivery: {
        ...existingRights,
        ...(nested || {}),
        artwork_dsp_url: ensured.url,
        artwork_dsp_width: ensured.width,
        artwork_dsp_height: ensured.height,
        artwork_dsp_bytes: ensured.bytes,
        artwork_dsp_path: ensured.path,
      },
    }

    const updates: Record<string, unknown> = { marketing_copy: withNested }
    // Prefer dedicated column when migration applied.
    updates.artwork_dsp_url = ensured.url

    let { error: updateError } = await supabase
      .from('distribution_releases')
      .update(updates)
      .eq('id', params.id)

    if (updateError && /artwork_dsp_url/i.test(updateError.message)) {
      ;({ error: updateError } = await supabase
        .from('distribution_releases')
        .update({ marketing_copy: withNested })
        .eq('id', params.id))
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      source: sourceProbe,
      dsp: ensured,
      folder: `gallery-images/${ensured.path}`,
      note: 'Site artwork_url unchanged — DSP pack uses release-covers folder only.',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'DSP artwork failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = createSupabaseServerClient()
    type ArtRow = {
      id: string
      artwork_url?: string | null
      artwork_dsp_url?: string | null
      marketing_copy?: unknown
    }
    let { data: release, error } = await supabase
      .from('distribution_releases')
      .select('id, artwork_url, artwork_dsp_url, marketing_copy')
      .eq('id', params.id)
      .single()

    if (error && /artwork_dsp_url/i.test(error.message)) {
      const fallback = await supabase
        .from('distribution_releases')
        .select('id, artwork_url, marketing_copy')
        .eq('id', params.id)
        .single()
      release = fallback.data as typeof release
      error = fallback.error
    }
    if (error || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const artRow = release as ArtRow
    const siteUrl = String(artRow.artwork_url || '').trim()
    const nested = (artRow.marketing_copy as Record<string, unknown> | null)?.revelator_delivery as
      | Record<string, unknown>
      | undefined
    const dspUrl =
      String(artRow.artwork_dsp_url || '').trim() ||
      String(nested?.artwork_dsp_url || '').trim() ||
      String((artRow.marketing_copy as Record<string, unknown> | null)?.artwork_dsp_url || '').trim()

    const site = siteUrl ? await probeArtworkUrl(siteUrl).catch((e) => ({ error: String(e) })) : null
    const dsp = dspUrl ? await probeArtworkUrl(dspUrl).catch((e) => ({ error: String(e) })) : null

    return NextResponse.json({
      artwork_url: siteUrl || null,
      artwork_dsp_url: dspUrl || null,
      site,
      dsp,
      folderHint: `gallery-images/studio/release-covers/${params.id}/dsp-ready.jpg`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Probe failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
