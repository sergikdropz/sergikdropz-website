import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  objectExistsInAudioFilesBucket,
  primaryStorageKeyForAudioFile,
  type AudioRowForAudit,
} from '@/lib/audioStorageAudit'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100
const DEFAULT_CONCURRENCY = 6

type MissingItem = {
  id: string
  title: string | null
  artist: string | null
  file_path: string | null
  file_name: string | null
  file_url: string | null
  checkedKey: string
}

type SkippedItem = { id: string; reason: string }
type ListErrorItem = { id: string; checkedKey: string; message: string }

async function mapInParallel<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    const part = await Promise.all(slice.map(fn))
    out.push(...part)
  }
  return out
}

/**
 * GET /api/admin/storage-audio-audit
 * Compares `audio_files` rows to objects in the `audio-files` bucket.
 *
 * Query: limit (1–500, default 100), offset (default 0), concurrency (1–20, default 6),
 *        details=0 or summary=1 to omit `missing` / `listErrors` arrays (counts only).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await supabaseIsReachable())) {
    return supabaseUnavailableResponse()
  }

  const sp = request.nextUrl.searchParams
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(sp.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  )
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
  const concurrency = Math.min(
    20,
    Math.max(1, parseInt(sp.get('concurrency') || String(DEFAULT_CONCURRENCY), 10) || DEFAULT_CONCURRENCY),
  )
  const includeDetails = sp.get('details') !== '0' && sp.get('summary') !== '1'

  const supabase = createSupabaseServerClient()

  const { count: totalAudioRows, error: countError } = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    return NextResponse.json(
      { error: 'Could not count audio_files', details: countError.message },
      { status: 500 },
    )
  }

  const { data: rows, error: listError } = await supabase
    .from('audio_files')
    .select('id, file_path, file_name, file_url, title, artist')
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (listError) {
    return NextResponse.json(
      { error: 'Could not list audio_files', details: listError.message },
      { status: 500 },
    )
  }

  const list = (rows || []) as AudioRowForAudit[]

  const missing: MissingItem[] = []
  const skipped: SkippedItem[] = []
  const listErrors: ListErrorItem[] = []
  let ok = 0

  const results = await mapInParallel(list, concurrency, async (row) => {
    const key = primaryStorageKeyForAudioFile(row)
    if (!key) {
      return { kind: 'skip' as const, row, reason: 'no file_path or derivable file_url' }
    }
    const { exists, matchedKey, storageListError } = await objectExistsInAudioFilesBucket(supabase, key)
    if (exists) {
      return { kind: 'ok' as const }
    }
    if (storageListError) {
      return { kind: 'list_err' as const, row, key: matchedKey || key, message: storageListError }
    }
    return { kind: 'missing' as const, row, key: matchedKey || key }
  })

  for (const r of results) {
    if (r.kind === 'ok') {
      ok++
    } else if (r.kind === 'skip') {
      skipped.push({ id: r.row.id, reason: r.reason })
    } else if (r.kind === 'list_err') {
      listErrors.push({ id: r.row.id, checkedKey: r.key, message: r.message })
    } else {
      missing.push({
        id: r.row.id,
        title: r.row.title,
        artist: r.row.artist,
        file_path: r.row.file_path,
        file_name: r.row.file_name,
        file_url: r.row.file_url,
        checkedKey: r.key,
      })
    }
  }

  const trulyMissing = results.filter((x) => x.kind === 'missing').length
  const listErrCount = results.filter((x) => x.kind === 'list_err').length

  const body: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    table: 'audio_files',
    bucket: 'audio-files',
    totalAudioRows: totalAudioRows ?? null,
    offset,
    limit,
    scanned: list.length,
    nextOffset: offset + list.length < (totalAudioRows || 0) ? offset + limit : null,
    summary: {
      ok,
      missingInStorage: trulyMissing,
      storageListErrors: listErrCount,
      skipped: skipped.length,
    },
  }

  if (includeDetails) {
    body.missing = missing
    body.skipped = skipped
    if (listErrCount) body.listErrors = listErrors
  }

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
