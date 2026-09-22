import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { normalizeIpi, normalizeIswc } from '@/lib/studio/dsp-package'
import {
  coerceTriStateBoolean,
  normalizePreviewStart,
  parseTrackOrigin,
} from '@/lib/studio/dsp-ingest'
import { validateISRC } from '@/lib/studio/isrc-format'
import { parseContributors } from '@/lib/studio/track-credits'
import { hydrateRightsPacket, mergeRightsPacketSnapshot } from '@/lib/studio/rights-ops'
import { serializeWriterLegalNames } from '@/lib/studio/songwriter'
import { normalizeSplitRows } from '@/lib/studio/import-parse'

/**
 * GET /api/studio/tracks/[id]
 * Get a single track
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

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching track:', error)
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ track: data })
  } catch (error: any) {
    console.error('Error in GET /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch track' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/studio/tracks/[id]
 * Update a track
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
    const allowed = [
      'title',
      'release_id',
      'wav_url',
      'isrc_full',
      'splits',
      'version',
      'duration',
      'explicit',
      'language',
      'instrumental',
      'track_number',
      'iswc',
      'publisher_name',
      'publisher_ipi',
      'contributors',
      'music_library_track_id',
      'origin',
      'cover_original_title',
      'cover_original_artist',
      'writer_legal_names',
      'ai_generated',
      'radio_edit',
      'paired_explicit_isrc',
      'preview_start_seconds',
      'mechanical_licensed',
      'contains_samples',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (!(key in body)) continue
      if (key === 'iswc') {
        updates[key] = normalizeIswc(body[key]) || (body[key] ? String(body[key]).trim() : null)
        continue
      }
      if (key === 'publisher_ipi') {
        updates[key] = normalizeIpi(body[key]) || (body[key] ? String(body[key]).replace(/\D/g, '') : null)
        continue
      }
      if (key === 'track_number') {
        const n = Number(body[key])
        updates[key] = Number.isFinite(n) && n > 0 ? n : null
        continue
      }
      if (key === 'origin') {
        updates[key] = parseTrackOrigin(body[key])
        continue
      }
      if (key === 'ai_generated') {
        updates[key] = coerceTriStateBoolean(body[key])
        continue
      }
      if (key === 'radio_edit' || key === 'mechanical_licensed' || key === 'contains_samples') {
        updates[key] = Boolean(body[key])
        continue
      }
      if (key === 'preview_start_seconds') {
        updates[key] = normalizePreviewStart(body[key])
        continue
      }
      if (key === 'paired_explicit_isrc') {
        const raw = body[key] ? String(body[key]).trim() : ''
        updates[key] = raw && validateISRC(raw) ? raw.replace(/-/g, '').toUpperCase() : raw || null
        continue
      }
      if (
        key === 'cover_original_title' ||
        key === 'cover_original_artist'
      ) {
        updates[key] = body[key] ? String(body[key]).trim() : null
        continue
      }
      if (key === 'writer_legal_names') {
        if (Array.isArray(body[key])) {
          updates[key] = serializeWriterLegalNames(
            (body[key] as Array<{ stage?: string; legal?: string }>).map((row) => ({
              stage: String(row?.stage || ''),
              legal: String(row?.legal || ''),
            })),
          )
        } else {
          updates[key] = body[key] ? String(body[key]).trim() : null
        }
        continue
      }
      if (key === 'splits') {
        updates[key] = normalizeSplitRows(body[key])
        continue
      }
      if (key === 'title') {
        updates[key] = body[key] ? String(body[key]).trim() : ''
        continue
      }
      if (key === 'contributors') {
        updates[key] = parseContributors(body[key])
        continue
      }
      updates[key] = body[key]
    }

    const packet: { mechanical_licensed?: boolean; contains_samples?: boolean } = {}
    if ('mechanical_licensed' in updates) packet.mechanical_licensed = Boolean(updates.mechanical_licensed)
    if ('contains_samples' in updates) packet.contains_samples = Boolean(updates.contains_samples)

    if ('lyrics' in body || 'lyrics_excerpt' in body || 'description' in body || 'intention' in body || Object.keys(packet).length) {
      const { data: current } = await supabase
        .from('distribution_tracks')
        .select('sonic_snapshot')
        .eq('id', params.id)
        .maybeSingle()
      let snap =
        current?.sonic_snapshot &&
        typeof current.sonic_snapshot === 'object' &&
        !Array.isArray(current.sonic_snapshot)
          ? (current.sonic_snapshot as Record<string, unknown>)
          : {}
      if ('lyrics' in body || 'lyrics_excerpt' in body) {
        const lyrics = String(body.lyrics ?? body.lyrics_excerpt ?? '').trim()
        snap = { ...snap, lyrics_excerpt: lyrics || null }
      }
      if ('description' in body || 'intention' in body) {
        const description =
          'description' in body ? String(body.description ?? '').trim() || null : (snap.description as string | null) ?? null
        const intention =
          'intention' in body ? String(body.intention ?? '').trim() || null : (snap.intention as string | null) ?? null
        snap = { ...snap, description, intention, press_source: 'edited' }
        updates.description = description
      }
      if (Object.keys(packet).length) {
        snap = mergeRightsPacketSnapshot(snap, packet)
      }
      updates.sonic_snapshot = snap
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid track fields provided' }, { status: 400 })
    }

    let { data, error } = await supabase
      .from('distribution_tracks')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error && /mechanical_licensed|contains_samples/i.test(error.message || '')) {
      const retry = { ...updates }
      delete retry.mechanical_licensed
      delete retry.contains_samples
      const retried = await supabase
        .from('distribution_tracks')
        .update(retry)
        .eq('id', params.id)
        .select()
        .single()
      data = retried.data
      error = retried.error
    }

    if (error) {
      const missingIngest =
        /origin|writer_legal_names|ai_generated|cover_original|radio_edit|preview_start|sonic_snapshot|mechanical_licensed|contains_samples/i.test(
          error.message || '',
        )
      return NextResponse.json(
        {
          error: missingIngest
            ? 'Run web/supabase/migrations/add_dsp_ingest_fields.sql so DSP ingest fields can save.'
            : error.message || 'Failed to update track',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ track: hydrateRightsPacket((data || {}) as Record<string, unknown>) })
  } catch (error: any) {
    console.error('Error in PUT /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update track' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/studio/tracks/[id]
 * Delete a track
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
      .from('distribution_tracks')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting track:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete track' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/studio/tracks/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete track' },
      { status: 500 }
    )
  }
}
