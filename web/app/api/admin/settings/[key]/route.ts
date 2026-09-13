import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/admin/settings/[key]
 * Delete a setting (admin-only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { key: string } }
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

    const { key } = params

    if (!key) {
      return NextResponse.json(
        { error: 'key is required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    const { error } = await supabase
      .from('settings')
      .delete()
      .eq('key', key)

    if (error) {
      console.error('Error deleting setting:', error)
      return NextResponse.json(
        { error: 'Failed to delete setting' },
        { status: 500 }
      )
    }

    // Log activity
    await logActivity({
      actionType: 'delete',
      resourceType: 'setting',
      resourceId: key,
      details: { key },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
