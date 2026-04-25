import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'

export const dynamic = 'force-dynamic'

async function assertOwnPlaylist(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  playlistId: string
) {
  const { data, error } = await supabase
    .from('fan_playlists')
    .select('id')
    .eq('id', playlistId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return false
  return true
}

async function libraryTrackExists(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  trackId: string
) {
  const { data } = await supabase.from('music_library_tracks').select('id').eq('id', trackId).maybeSingle()
  return !!data
}

async function replacePlaylistTracks(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  playlistId: string,
  trackIds: string[]
) {
  await supabase.from('fan_playlist_tracks').delete().eq('playlist_id', playlistId)
  if (trackIds.length === 0) return
  const rows = trackIds.map((library_track_id, position) => ({
    playlist_id: playlistId,
    library_track_id,
    position,
  }))
  const { error } = await supabase.from('fan_playlist_tracks').insert(rows)
  if (error) throw error
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate
  const { id: playlistId } = params

  try {
    const supabase = createSupabaseServerClient()
    if (!(await assertOwnPlaylist(supabase, session.user.id, playlistId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: pl } = await supabase
      .from('fan_playlists')
      .select('id,name,description,created_at,updated_at')
      .eq('id', playlistId)
      .single()

    const { data: trackRows } = await supabase
      .from('fan_playlist_tracks')
      .select('library_track_id,position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })

    const trackIds = (trackRows || []).map((r) => r.library_track_id)

    return NextResponse.json({
      playlist: pl
        ? {
            id: pl.id,
            name: pl.name,
            description: pl.description || undefined,
            trackIds,
            createdAt: pl.created_at,
            isFan: true as const,
          }
        : null,
    })
  } catch (e) {
    console.error('GET /api/fan/playlists/[id]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate
  const { id: playlistId } = params

  try {
    const supabase = createSupabaseServerClient()
    if (!(await assertOwnPlaylist(supabase, session.user.id, playlistId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
    if (typeof body.description === 'string') patch.description = body.description.trim() || null

    if (Object.keys(patch).length > 1) {
      await supabase.from('fan_playlists').update(patch).eq('id', playlistId)
    }

    if (Array.isArray(body.trackIds)) {
      const trackIds = body.trackIds.filter((x: unknown) => typeof x === 'string') as string[]
      for (const tid of trackIds) {
        if (!(await libraryTrackExists(supabase, tid))) {
          return NextResponse.json({ error: `Unknown track: ${tid}` }, { status: 400 })
        }
      }
      await replacePlaylistTracks(supabase, playlistId, trackIds)
    }

    if (typeof body.addTrackId === 'string') {
      const tid = body.addTrackId
      if (!(await libraryTrackExists(supabase, tid))) {
        return NextResponse.json({ error: 'Unknown track' }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('fan_playlist_tracks')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('library_track_id', tid)
        .maybeSingle()
      if (!existing) {
        const { data: maxRow } = await supabase
          .from('fan_playlist_tracks')
          .select('position')
          .eq('playlist_id', playlistId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
        const nextPos = maxRow ? maxRow.position + 1 : 0
        await supabase.from('fan_playlist_tracks').insert({
          playlist_id: playlistId,
          library_track_id: tid,
          position: nextPos,
        })
      }
    }

    if (typeof body.removeTrackId === 'string') {
      await supabase
        .from('fan_playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('library_track_id', body.removeTrackId)
    }

    const { data: pl } = await supabase
      .from('fan_playlists')
      .select('id,name,description,created_at,updated_at')
      .eq('id', playlistId)
      .single()

    const { data: trackRows } = await supabase
      .from('fan_playlist_tracks')
      .select('library_track_id,position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })

    const trackIdsOut = (trackRows || []).map((r) => r.library_track_id)

    return NextResponse.json({
      playlist: pl
        ? {
            id: pl.id,
            name: pl.name,
            description: pl.description || undefined,
            trackIds: trackIdsOut,
            createdAt: pl.created_at,
            isFan: true as const,
          }
        : null,
    })
  } catch (e) {
    console.error('PATCH /api/fan/playlists/[id]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate
  const { id: playlistId } = params

  try {
    const supabase = createSupabaseServerClient()
    if (!(await assertOwnPlaylist(supabase, session.user.id, playlistId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await supabase.from('fan_playlists').delete().eq('id', playlistId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('DELETE /api/fan/playlists/[id]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
