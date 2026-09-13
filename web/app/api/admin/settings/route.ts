import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/settings
 * Get all settings (admin-only)
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

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .order('key', { ascending: true })

    if (error) {
      console.error('Error fetching settings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      )
    }

    // Convert array to object for easier access
    const settingsObject: Record<string, any> = {}
    data?.forEach((setting) => {
      settingsObject[setting.key] = {
        value: setting.value,
        description: setting.description,
        updatedAt: setting.updated_at,
        updatedBy: setting.updated_by,
      }
    })

    return NextResponse.json({ settings: settingsObject })
  } catch (error: any) {
    console.error('Settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/settings
 * Create or update a setting (admin-only)
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
    const { key, value, description } = body

    if (!key) {
      return NextResponse.json(
        { error: 'key is required' },
        { status: 400 }
      )
    }

    if (value === undefined) {
      return NextResponse.json(
        { error: 'value is required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Check if setting exists
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('key', key)
      .single()

    const isUpdate = !!existing

    // Upsert the setting
    const { data, error } = await supabase
      .from('settings')
      .upsert({
        key,
        value,
        description: description || null,
        updated_by: session.user.id,
      }, {
        onConflict: 'key',
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving setting:', error)
      return NextResponse.json(
        { error: 'Failed to save setting' },
        { status: 500 }
      )
    }

    // Log activity
    await logActivity({
      actionType: isUpdate ? 'update' : 'create',
      resourceType: 'setting',
      resourceId: key,
      details: { key, isUpdate },
    })

    return NextResponse.json({ 
      success: true, 
      setting: data,
      isUpdate,
    })
  } catch (error: any) {
    console.error('Settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
