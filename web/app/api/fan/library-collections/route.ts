import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'

export const dynamic = 'force-dynamic'

type Collection = 'wishlist' | 'cart' | 'vault_favorites'

const TABLE_BY_COLLECTION: Record<Collection, string> = {
  wishlist: 'fan_library_wishlist',
  cart: 'fan_library_cart',
  vault_favorites: 'fan_vault_favorites',
}

async function libraryTrackExists(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  trackId: string
) {
  const { data } = await supabase.from('music_library_tracks').select('id').eq('id', trackId).maybeSingle()
  return !!data
}

export async function GET(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate
  const uid = session.user.id

  try {
    const supabase = createSupabaseServerClient()

    const [wishRes, cartRes, favRes] = await Promise.all([
      supabase.from('fan_library_wishlist').select('library_track_id').eq('user_id', uid),
      supabase.from('fan_library_cart').select('library_track_id').eq('user_id', uid),
      supabase.from('fan_vault_favorites').select('library_track_id').eq('user_id', uid),
    ])

    if (wishRes.error) console.error('fan_library_wishlist list:', wishRes.error)
    if (cartRes.error) console.error('fan_library_cart list:', cartRes.error)
    if (favRes.error) console.error('fan_vault_favorites list:', favRes.error)

    return NextResponse.json({
      wishlist: (wishRes.data || []).map((r) => r.library_track_id as string),
      cart: (cartRes.data || []).map((r) => r.library_track_id as string),
      vaultFavorites: (favRes.data || []).map((r) => r.library_track_id as string),
    })
  } catch (e) {
    console.error('GET /api/fan/library-collections', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const body = await request.json()
    const collection = body.collection as Collection
    const trackId = typeof body.trackId === 'string' ? body.trackId.trim() : ''
    const add = body.add === true

    if (!trackId || !(collection in TABLE_BY_COLLECTION)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    if (!(await libraryTrackExists(supabase, trackId))) {
      return NextResponse.json({ error: 'Unknown track' }, { status: 400 })
    }

    await supabase.from('fan_profiles').upsert(
      { id: session.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )

    const table = TABLE_BY_COLLECTION[collection]

    if (add) {
      const { error } = await supabase.from(table).insert({
        user_id: session.user.id,
        library_track_id: trackId,
      })
      if (error && error.code !== '23505') {
        console.error(`${table} insert:`, error)
        return NextResponse.json({ error: 'Could not save' }, { status: 500 })
      }
    } else {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('user_id', session.user.id)
        .eq('library_track_id', trackId)
      if (error) {
        console.error(`${table} delete:`, error)
        return NextResponse.json({ error: 'Could not remove' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/fan/library-collections', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
