import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const collaboratorId = searchParams.get('collaborator_id')
    const status = searchParams.get('status')

    const supabase = createSupabaseServerClient()
    const splitsConfig = await import('@/data/revenue-splits.json')

    let query = supabase
      .from('revenue_splits')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (collaboratorId) {
      query = query.eq('collaborator_id', collaboratorId)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: splits, error, count } = await query

    if (error) {
      console.error('Error fetching splits:', error)
      return NextResponse.json({ error: 'Failed to fetch splits' }, { status: 500 })
    }

    const collaboratorSummary = splitsConfig.collaborators.map((collab: any) => {
      const collabSplits = (splits || []).filter((s: any) => s.collaborator_id === collab.id)
      const totalOwed = collabSplits
        .filter((s: any) => s.status === 'owed')
        .reduce((sum: number, s: any) => sum + s.collaborator_amount, 0)
      const totalPaid = collabSplits
        .filter((s: any) => s.status === 'paid')
        .reduce((sum: number, s: any) => sum + s.collaborator_amount, 0)

      return {
        ...collab,
        totalOwed,
        totalPaid,
        totalTransactions: collabSplits.length,
      }
    })

    return NextResponse.json({
      splits: splits || [],
      collaborators: collaboratorSummary,
      config: splitsConfig.splits,
      total: count || 0,
    })
  } catch (error: any) {
    console.error('Splits API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { splitIds, action, paidVia, notes } = body

    if (!splitIds?.length || !action) {
      return NextResponse.json({ error: 'splitIds and action required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    if (action === 'mark_paid') {
      const { error } = await supabase
        .from('revenue_splits')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_via: paidVia || 'manual',
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .in('id', splitIds)

      if (error) {
        console.error('Error marking splits paid:', error)
        return NextResponse.json({ error: 'Failed to update splits' }, { status: 500 })
      }
    } else if (action === 'void') {
      const { error } = await supabase
        .from('revenue_splits')
        .update({
          status: 'voided',
          notes: notes || 'Voided by admin',
          updated_at: new Date().toISOString(),
        })
        .in('id', splitIds)

      if (error) {
        console.error('Error voiding splits:', error)
        return NextResponse.json({ error: 'Failed to void splits' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Splits PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
