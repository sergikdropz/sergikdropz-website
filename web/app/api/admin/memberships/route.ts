import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching memberships:', error)
      return NextResponse.json({ error: 'Failed to fetch memberships' }, { status: 500 })
    }

    return NextResponse.json({ memberships: data || [] })
  } catch (error: any) {
    console.error('Admin memberships error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
