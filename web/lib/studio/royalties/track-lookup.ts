import { createSupabaseServerClient } from '@/lib/supabase'
import type { TrackSplitLookup } from '@/lib/studio/royalties/ingest'
import type { SplitShare } from '@/lib/studio/royalties/types'

type TrackRow = {
  id: string
  title?: string | null
  isrc_full?: string | null
  release_id?: string | null
  splits?: unknown
}

function asSplits(raw: unknown): SplitShare[] | null {
  if (!Array.isArray(raw) || !raw.length) return null
  const out: SplitShare[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as { name?: unknown; percentage?: unknown; payeeId?: unknown }
    const name = row.name == null ? '' : String(row.name).trim()
    const percentage = Number(row.percentage)
    if (!name || !Number.isFinite(percentage)) continue
    out.push({
      name,
      percentage,
      payeeId: row.payeeId == null ? null : String(row.payeeId),
    })
  }
  return out.length ? out : null
}

/** Load track split sheets keyed by ISRC for statement allocation. */
export async function loadTrackSplitLookup(
  supabase = createSupabaseServerClient(),
): Promise<TrackSplitLookup[]> {
  const { data, error } = await supabase
    .from('distribution_tracks')
    .select('id, title, isrc_full, release_id, splits')
    .not('isrc_full', 'is', null)
    .limit(2000)

  if (error) {
    console.warn('[royalties] track split lookup failed:', error.message)
    return []
  }

  return ((data || []) as TrackRow[]).map((row) => ({
    isrc: row.isrc_full || null,
    trackId: row.id,
    releaseId: row.release_id || null,
    title: row.title || null,
    splits: asSplits(row.splits),
  }))
}
