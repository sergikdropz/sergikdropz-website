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

    // auth.users is not in the PostgREST schema, so embedding it makes the
    // whole list query fail (PGRST100) and the UI looks like nothing saved.
    const { data: admins, error } = await supabase
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching admin users:', error)
      return NextResponse.json(
        { error: 'Failed to fetch admin users' },
        { status: 500 }
      )
    }

    const { data: authList, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    if (authError) {
      console.error('Error listing auth users for admin directory:', authError)
    }
    const authById = new Map(
      (authList?.users ?? []).map((authUser) => [authUser.id, authUser])
    )

    // Get activity logs to find last activity per user
    const { data: activityLogs } = await supabase
      .from('activity_logs')
      .select('admin_id, created_at')
      .order('created_at', { ascending: false })

    // Map last activity and auth profile to each admin
    const adminsWithActivity = admins?.map((admin: any) => {
      const authUser = authById.get(admin.user_id)
      const lastActivity = activityLogs?.find((log) => log.admin_id === admin.user_id)
      return {
        ...admin,
        email: admin.email || authUser?.email || '',
        lastActivity: lastActivity?.created_at || null,
        user: authUser
          ? {
              id: authUser.id,
              email: authUser.email,
              created_at: authUser.created_at,
              last_sign_in_at: authUser.last_sign_in_at,
            }
          : null,
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
