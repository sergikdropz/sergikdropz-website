import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface TableInfo {
  name: string
  schema: string
  rowCount: number
  sizeBytes: number | null
  sizeFormatted: string
  columns: ColumnInfo[]
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
}

/**
 * GET /api/admin/database
 * Returns database metadata: tables, row counts, sizes, columns
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient()

    const { data: tableRows, error: tableError } = await supabase.rpc('get_database_tables_info')

    if (tableError) {
      const tables = await getFallbackTableInfo(supabase)
      return NextResponse.json({ tables, mode: 'fallback' })
    }

    return NextResponse.json({ tables: tableRows, mode: 'rpc' })
  } catch (error: any) {
    console.error('Database info error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/database
 * Execute a read-only SQL query (SELECT only)
 */
export async function POST(request: NextRequest) {
  try {
    const { query, action } = await request.json()

    const supabase = createSupabaseServerClient()

    if (action === 'table-data') {
      const { tableName, page = 1, pageSize = 50, orderBy, orderDir = 'asc', search } = query
      return await getTableData(supabase, tableName, page, pageSize, orderBy, orderDir, search)
    }

    if (action === 'query') {
      return await executeReadOnlyQuery(supabase, query.sql)
    }

    if (action === 'update-row') {
      const { tableName, rowId, idColumn = 'id', updates } = query
      return await updateRow(supabase, tableName, rowId, idColumn, updates)
    }

    if (action === 'delete-row') {
      const { tableName, rowId, idColumn = 'id' } = query
      return await deleteRow(supabase, tableName, rowId, idColumn)
    }

    if (action === 'insert-row') {
      const { tableName, row } = query
      return await insertRow(supabase, tableName, row)
    }

    if (action === 'duplicate-row') {
      const { tableName, rowId, idColumn = 'id' } = query
      return await duplicateRow(supabase, tableName, rowId, idColumn)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('Database query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function getTableData(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  tableName: string,
  page: number,
  pageSize: number,
  orderBy?: string,
  orderDir?: string,
  search?: string,
) {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')

  const { count } = await supabase
    .from(safeName)
    .select('*', { count: 'exact', head: true })

  let q = supabase.from(safeName).select('*')

  if (orderBy) {
    q = q.order(orderBy, { ascending: orderDir === 'asc' })
  } else {
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false })
  }

  const from = (page - 1) * pageSize
  q = q.range(from, from + pageSize - 1)

  const { data, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    rows: data || [],
    totalRows: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  })
}

async function executeReadOnlyQuery(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  sql: string,
) {
  const trimmed = sql.trim().replace(/;+$/, '').trim()
  const upper = trimmed.toUpperCase()

  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC']
  const firstWord = upper.split(/\s+/)[0]

  if (forbidden.includes(firstWord)) {
    return NextResponse.json(
      { error: `Write operations are not allowed. Only SELECT and read-only queries are permitted.` },
      { status: 403 },
    )
  }

  if (upper.includes('DROP ') || upper.includes('DELETE ') || upper.includes('TRUNCATE ')) {
    return NextResponse.json(
      { error: 'Destructive operations detected and blocked.' },
      { status: 403 },
    )
  }

  const { data, error } = await supabase.rpc('exec_readonly_query', {
    query_text: trimmed,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ rows: data || [], rowCount: Array.isArray(data) ? data.length : 0 })
}

async function getFallbackTableInfo(supabase: ReturnType<typeof createSupabaseServerClient>) {
  const knownTables = [
    'audio_files', 'purchases', 'instagram_media', 'gallery_images',
    'music_library_folders', 'music_library_tracks', 'music_library_playlists',
    'activity_logs', 'analytics_events', 'settings', 'admins',
    'memberships', 'merch_orders', 'licenses', 'revenue_splits',
    'email_subscribers', 'fan_profiles', 'fan_playlists', 'fan_playlist_tracks',
    'fan_leads', 'fans', 'smartlinks', 'smartlinks_clicks',
    'campaign_templates', 'campaigns', 'campaign_sequences',
    'campaign_sends', 'campaign_analytics', 'fan_segments', 'fan_segment_members',
    'distribution_releases', 'distribution_tracks', 'distribution_store_links',
    'isrc_counters', 'soundexchange_submissions',
  ]

  const tables: TableInfo[] = []

  for (const tableName of knownTables) {
    try {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })

      if (!error) {
        tables.push({
          name: tableName,
          schema: 'public',
          rowCount: count || 0,
          sizeBytes: null,
          sizeFormatted: 'N/A',
          columns: [],
        })
      }
    } catch {
      // Table doesn't exist, skip
    }
  }

  tables.sort((a, b) => b.rowCount - a.rowCount)
  return tables
}

async function updateRow(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  tableName: string,
  rowId: string,
  idColumn: string,
  updates: Record<string, any>,
) {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
  const safeIdCol = idColumn.replace(/[^a-zA-Z0-9_]/g, '')

  const { data, error } = await supabase
    .from(safeName)
    .update(updates)
    .eq(safeIdCol, rowId)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, row: data?.[0] || null })
}

async function deleteRow(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  tableName: string,
  rowId: string,
  idColumn: string,
) {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
  const safeIdCol = idColumn.replace(/[^a-zA-Z0-9_]/g, '')

  const { error } = await supabase
    .from(safeName)
    .delete()
    .eq(safeIdCol, rowId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

async function insertRow(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  tableName: string,
  row: Record<string, any>,
) {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')

  const { data, error } = await supabase
    .from(safeName)
    .insert(row)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, row: data?.[0] || null })
}

async function duplicateRow(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  tableName: string,
  rowId: string,
  idColumn: string,
) {
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
  const safeIdCol = idColumn.replace(/[^a-zA-Z0-9_]/g, '')

  const { data: existing, error: fetchError } = await supabase
    .from(safeName)
    .select('*')
    .eq(safeIdCol, rowId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message || 'Row not found' }, { status: 400 })
  }

  const newRow = { ...existing }
  delete newRow[safeIdCol]
  // Clear auto-generated timestamps so the DB sets fresh ones
  delete newRow.created_at
  delete newRow.updated_at

  const { data, error } = await supabase
    .from(safeName)
    .insert(newRow)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, row: data?.[0] || null })
}
