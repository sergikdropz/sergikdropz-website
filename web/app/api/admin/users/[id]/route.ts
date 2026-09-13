import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/users/[id]
 * Update admin user (activate/deactivate) (admin-only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { active } = body

    if (active === undefined) {
      return NextResponse.json(
        { error: 'active field is required' },
        { status: 400 }
      )
    }

    // Prevent deactivating yourself
    if (id === session.user.id && !active) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Get admin info before update
    const { data: adminBefore } = await supabase
      .from('admins')
      .select('email')
      .eq('user_id', id)
      .single()

    const { data, error } = await supabase
      .from('admins')
      .update({ active })
      .eq('user_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating admin user:', error)
      return NextResponse.json(
        { error: 'Failed to update admin user' },
        { status: 500 }
      )
    }

    // Log activity
    await logActivity({
      actionType: 'update',
      resourceType: 'user',
      resourceId: id,
      details: { email: adminBefore?.email, active },
    })

    return NextResponse.json({ success: true, user: data })
  } catch (error: any) {
    console.error('Update user API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Delete admin user (admin-only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params

    // Prevent deleting yourself
    if (id === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Get admin info before deletion
    const { data: adminBefore } = await supabase
      .from('admins')
      .select('email')
      .eq('user_id', id)
      .single()

    // Delete from admins table (cascade will handle auth.users if needed)
    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('user_id', id)

    if (error) {
      console.error('Error deleting admin user:', error)
      return NextResponse.json(
        { error: 'Failed to delete admin user' },
        { status: 500 }
      )
    }

    // Optionally delete from auth.users as well
    // Uncomment if you want to completely remove the user
    // await supabase.auth.admin.deleteUser(id)

    // Log activity
    await logActivity({
      actionType: 'delete',
      resourceType: 'user',
      resourceId: id,
      details: { email: adminBefore?.email },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete user API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
