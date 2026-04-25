import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'

export const dynamic = 'force-dynamic'

function mapRowsToTrackIds(
  trackRows: { playlist_id: string; library_track_id: string; position: number }[]
): Map<string, string[]> {
  const byPlaylist = new Map<string, { position: number; id: string }[]>()
  for (const r of trackRows) {
    if (!byPlaylist.has(r.playlist_id)) byPlaylist.set(r.playlist_id, [])
    byPlaylist.get(r.playlist_id)!.push({ position: r.position, id: r.library_track_id })
  }
  const out = new Map<string, string[]>()
  byPlaylist.forEach((arr, pid) => {
    arr.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    out.set(
      pid,
      arr.map((x: { id: string }) => x.id)
    )
  })
  return out
}

export async function GET(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const supabase = createSupabaseServerClient()
    const { data: playlists, error: plErr } = await supabase
      .from('fan_playlists')
      .select('id,name,description,created_at,updated_at')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false })

    if (plErr) {
      console.error('fan_playlists list:', plErr)
      return NextResponse.json({ playlists: [] })
    }

    const ids = (playlists || []).map((p) => p.id)
    if (ids.length === 0) {
      return NextResponse.json({ playlists: [] })
    }

    const { data: trackRows } = await supabase
      .from('fan_playlist_tracks')
      .select('playlist_id,library_track_id,position')
      .in('playlist_id', ids)

    const idMap = mapRowsToTrackIds(trackRows || [])

    const out = (playlists || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      trackIds: idMap.get(p.id) || [],
      createdAt: p.created_at,
      isFan: true as const,
    }))

    return NextResponse.json({ playlists: out })
  } catch (e) {
    console.error('GET /api/fan/playlists', e)
    return NextResponse.json({ playlists: [] })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const description =
      typeof body.description === 'string' ? body.description.trim() || null : null

    const supabase = createSupabaseServerClient()

    await supabase.from('fan_profiles').upsert(
      { id: session.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )

    const { data: created, error } = await supabase
      .from('fan_playlists')
      .insert({
        user_id: session.user.id,
        name,
        description,
      })
      .select('id,name,description,created_at,updated_at')
      .single()

    if (error || !created) {
      console.error('fan_playlists insert:', error)
      return NextResponse.json({ error: 'Could not create playlist' }, { status: 500 })
    }

    return NextResponse.json({
      playlist: {
        id: created.id,
        name: created.name,
        description: created.description || undefined,
        trackIds: [] as string[],
        createdAt: created.created_at,
        isFan: true as const,
      },
    })
  } catch (e) {
    console.error('POST /api/fan/playlists', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
