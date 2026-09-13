import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/admin/subscribers/[id]
 * Toggle is_active, update subscriber
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
      .from('email_subscribers')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating subscriber:', error)
      return NextResponse.json(
        { error: 'Failed to update subscriber' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, subscriber: data })
  } catch (error: any) {
    console.error('Subscriber update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
