import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/memberships/[id]
 * Single membership detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching membership:', error)
      return NextResponse.json(
        { error: 'Failed to fetch membership' },
        { status: 500 }
      )
    }

    return NextResponse.json({ membership: data })
  } catch (error: any) {
    console.error('Membership detail error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/memberships/[id]
 * Update membership status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('memberships')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating membership:', error)
      return NextResponse.json(
        { error: 'Failed to update membership' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, membership: data })
  } catch (error: any) {
    console.error('Membership update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
