import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type ActivityRow = {
  action_type: string | null
  resource_type: string | null
  resource_id: string | null
  details: Record<string, any> | null
  created_at: string | null
}

function formatActivity(row: ActivityRow) {
  const action = row.action_type ? row.action_type.replace(/_/g, ' ') : 'activity'
  const resource = row.resource_type ? ` ${row.resource_type}` : ''
  const target = row.resource_id ? ` ${row.resource_id}` : ''

  const detail =
    (row.details && (row.details.summary || row.details.message || row.details.title)) || ''
  const detailText = detail ? ` — ${detail}` : ''

  return {
    timestamp: row.created_at ? new Date(row.created_at).toLocaleString() : '',
    description: `${action}${resource}${target}${detailText}`.trim(),
  }
}

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient()
  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get('limit') || '10')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('action_type, resource_type, resource_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    const activities = (data || []).map(formatActivity)

    return NextResponse.json(
      { activities },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (error) {
    console.error('Recent activity query failed', error)
    return NextResponse.json(
      { activities: [] },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }
}
