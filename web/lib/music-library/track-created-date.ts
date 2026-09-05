/**
 * Permanent track "date created" (file/export create day), distinct from
 * library ingest time (`created_at` / `created_at_timestamp`) and release `date`.
 */

export function normalizeTrackCreatedDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (!text || text === 'null' || text === 'undefined') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

export function originalDateFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  return normalizeTrackCreatedDate((metadata as Record<string, unknown>).original_date)
}

export function createdDateFromTrack(track: {
  date_created?: unknown
  metadata?: unknown
}): string | null {
  return normalizeTrackCreatedDate(track.date_created) || originalDateFromMetadata(track.metadata)
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }
  return {}
}

/**
 * Merge incoming metadata onto existing without dropping a stored created date.
 * Incoming `original_date: null` is ignored unless `allowClear` is true.
 */
export function preserveCreatedDateMetadata(
  existing: unknown,
  incoming: unknown,
  opts?: { allowClear?: boolean },
): Record<string, unknown> {
  const prev = asMeta(existing)
  const next = asMeta(incoming)
  const merged = { ...prev, ...next }
  const incomingDate = originalDateFromMetadata(next)
  const existingDate = originalDateFromMetadata(prev)

  if (incomingDate) {
    merged.original_date = incomingDate
    if (typeof merged.original_date_source !== 'string' && typeof prev.original_date_source === 'string') {
      merged.original_date_source = prev.original_date_source
    }
    return merged
  }

  if (existingDate && (!opts?.allowClear || next.original_date === undefined)) {
    merged.original_date = existingDate
    if (typeof prev.original_date_source === 'string') {
      merged.original_date_source = prev.original_date_source
    }
    if (typeof prev.original_date_export_path === 'string' && merged.original_date_export_path == null) {
      merged.original_date_export_path = prev.original_date_export_path
    }
  }

  return merged
}

export function stampCreatedDate(
  metadata: unknown,
  isoDate: string | null | undefined,
  source?: string,
): Record<string, unknown> {
  const next = asMeta(metadata)
  const date = normalizeTrackCreatedDate(isoDate)
  if (!date) return next
  next.original_date = date
  if (source && typeof next.original_date_source !== 'string') {
    next.original_date_source = source
  }
  return next
}

/** Fields to persist on music_library_tracks so created date survives sync/upsert. */
export function persistedCreatedDateFields(opts: {
  existing?: { metadata?: unknown; date_created?: unknown; year?: unknown } | null
  incoming?: { metadata?: unknown; date_created?: unknown; year?: unknown } | null
}): { metadata: Record<string, unknown>; date_created: string | null; year: number | null } {
  const existing = opts.existing || null
  const incoming = opts.incoming || null
  const metadata = preserveCreatedDateMetadata(existing?.metadata, incoming?.metadata)
  const date_created =
    createdDateFromTrack({
      date_created: incoming?.date_created ?? existing?.date_created,
      metadata,
    }) || null
  const stamped = date_created ? stampCreatedDate(metadata, date_created) : metadata
  const yearFromDate = date_created ? Number(date_created.slice(0, 4)) : NaN
  const yearRaw = incoming?.year ?? existing?.year
  const yearNum = Number(yearRaw)
  const year = Number.isFinite(yearNum) && yearNum > 1900
    ? yearNum
    : Number.isFinite(yearFromDate)
      ? yearFromDate
      : null
  return { metadata: stamped, date_created, year }
}
