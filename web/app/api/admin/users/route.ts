import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { createAdminUser } from '@/lib/admin/createAdminUser'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users
 * List all admin users (admin-only)
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

    const supabase = createSupabaseServerClient()

    // Get all admins
    const { data: admins, error } = await supabase
      .from('admins')
      .select(`
        *,
        user:auth.users!admins_user_id_fkey (
          id,
          email,
          created_at,
          last_sign_in_at
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching admin users:', error)
      return NextResponse.json(
        { error: 'Failed to fetch admin users' },
        { status: 500 }
      )
    }

    // Get activity logs to find last activity per user
    const { data: activityLogs } = await supabase
      .from('activity_logs')
      .select('admin_id, created_at')
      .order('created_at', { ascending: false })

    // Map last activity to each admin
    const adminsWithActivity = admins?.map((admin: any) => {
      const lastActivity = activityLogs?.find((log) => log.admin_id === admin.user_id)
      return {
        ...admin,
        lastActivity: lastActivity?.created_at || null,
      }
    })

    return NextResponse.json({ users: adminsWithActivity || [] })
  } catch (error: any) {
    console.error('Users API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/users
 * Create new admin user (admin-only)
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
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    let created
    try {
      created = await createAdminUser(supabase, email, password)
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Failed to create user' },
        { status: 400 }
      )
    }

    // Log activity
    await logActivity({
      actionType: 'create',
      resourceType: 'user',
      resourceId: created.userId,
      details: { email, wasExisting: created.wasExisting },
    })

    return NextResponse.json({
      success: true,
      message: created.message,
      userId: created.userId,
    })
  } catch (error: any) {
    console.error('Create user API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
