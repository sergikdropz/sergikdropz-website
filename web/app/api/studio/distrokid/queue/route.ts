import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { loadDistroKidQueue } from '@/lib/studio/distrokid-delivery-server'

/** GET /api/studio/distrokid/queue — scheduled releases waiting on DistroKid upload. */
export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createSupabaseServerClient()
  const loaded = await loadDistroKidQueue(supabase)
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: 500 })

  return NextResponse.json({
    pipe: loaded.pipe,
    queue: loaded.queue,
  })
}
