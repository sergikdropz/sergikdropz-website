import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/logs
 * Get activity logs with filtering (admin-only)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('admin_id')
    const actionType = searchParams.get('action_type')
    const resourceType = searchParams.get('resource_type')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const supabase = createSupabaseServerClient()

    // Build query
    let query = supabase
      .from('activity_logs')
      .select(`
        *,
        admin:admins!activity_logs_admin_id_fkey (
          email
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (adminId) {
      query = query.eq('admin_id', adminId)
    }

    if (actionType) {
      query = query.eq('action_type', actionType)
    }

    if (resourceType) {
      query = query.eq('resource_type', resourceType)
    }

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching activity logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch activity logs' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      logs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('Activity logs API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/logs
 * Internal endpoint to log activities (admin-only, called by other routes)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { actionType, resourceType, resourceId, details } = body

    if (!actionType) {
      return NextResponse.json(
        { error: 'actionType is required' },
        { status: 400 }
      )
    }

    // Use the logActivity utility
    await logActivity({
      actionType,
      resourceType,
      resourceId,
      details,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Log activity API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
