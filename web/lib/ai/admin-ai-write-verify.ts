/**
 * Compare an approved write with a fresh release snapshot.
 */

const COPY_FIELDS = [
  'elevator_pitch',
  'press_blurb',
  'spotify_pitch',
  'social_caption',
  'store_description',
  'youtube_visualizer',
  'platform_tags',
  'credits_block',
] as const

const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/

export type WriteCheck = {
  field: string
  expected: string
  actual: string
  matched: boolean
}

export type WriteVerification = {
  matched: boolean
  checks: WriteCheck[]
  summary: string
}

export function compareWriteToReread(input: {
  tool: string
  payload: Record<string, unknown>
  reread: Record<string, unknown>
}): WriteVerification {
  const checks = checksFor(input.tool, input.payload, input.reread)
  if (!checks.length) {
    const title = actualValue(input.reread, 'title')
    return {
      matched: true,
      checks,
      summary: title ? `Re-read "${title}" after ${input.tool}.` : `Re-read the release after ${input.tool}.`,
    }
  }
  const missed = checks.filter((check) => !check.matched)
  if (!missed.length) {
    return {
      matched: true,
      checks,
      summary: `Re-read confirmed ${checks.map((check) => check.field).slice(0, 4).join(', ')}.`,
    }
  }
  return {
    matched: false,
    checks,
    summary: `Re-read mismatch on ${missed.map((check) => check.field).slice(0, 4).join(', ')}.`,
  }
}

export function formatExecutionVerification(
  results: Array<{ verification?: WriteVerification | null }>,
): string {
  return results
    .map((row) => row.verification?.summary?.trim() || '')
    .filter(Boolean)
    .join(' ')
}

function checksFor(tool: string, payload: Record<string, unknown>, reread: Record<string, unknown>): WriteCheck[] {
  if (tool === 'patch_release_marketing_copy') return copyChecks(payload, reread)
  if (tool === 'update_copyright_checklist') return copyrightChecks(payload, reread)
  if (tool === 'assign_isrcs' || tool === 'pull_distrokid_isrcs') return isrcChecks(payload, reread)
  if (tool === 'create_distribution_release_draft') return draftChecks(payload, reread)
  return []
}

function copyChecks(payload: Record<string, unknown>, reread: Record<string, unknown>): WriteCheck[] {
  const copy = record(payload.marketingCopy)
  const checks: WriteCheck[] = []
  for (const field of COPY_FIELDS) {
    const expected = typeof copy?.[field] === 'string' ? copy[field].trim() : ''
    if (!expected) continue
    checks.push(compareField(field, expected, actualValue(reread, field)))
  }
  const upc = stringField(payload.upc) || stringField(copy?.upc)
  if (upc) checks.push(compareField('upc', upc, actualValue(reread, 'upc')))
  const previous = stringField(payload.previous_upc) || stringField(copy?.previous_upc)
  if (previous) checks.push(compareField('previous_upc', previous, actualValue(reread, 'previous_upc')))
  return checks
}

function copyrightChecks(payload: Record<string, unknown>, reread: Record<string, unknown>): WriteCheck[] {
  const updates = record(payload.updates) || payload
  const checks: WriteCheck[] = []
  for (const [field, value] of Object.entries(updates)) {
    if (field === 'releaseId' || field === 'dryRun' || field === 'updates') continue
    if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') continue
    checks.push(compareField(field, String(value), actualValue(reread, field)))
  }
  return checks
}

function isrcChecks(payload: Record<string, unknown>, reread: Record<string, unknown>): WriteCheck[] {
  const tracks = Array.isArray(reread.tracks) ? reread.tracks.map(record).filter((row): row is Record<string, unknown> => Boolean(row)) : []
  const ids = Array.isArray(payload.trackIds) ? payload.trackIds.map((id) => String(id)) : []
  const targets = ids.length ? tracks.filter((track) => ids.includes(String(track.id || ''))) : tracks
  if (!targets.length) {
    return [compareField('tracks', 'ISRC', '')]
  }
  return targets.map((track) => {
    const code = stringField(track.isrc_full) || stringField(track.isrc)
    return compareField(String(track.title || track.id || 'track'), 'ISRC', ISRC.test(code) ? code : '')
  })
}

function draftChecks(payload: Record<string, unknown>, reread: Record<string, unknown>): WriteCheck[] {
  const checks: WriteCheck[] = []
  const title = stringField(payload.title)
  if (title) checks.push(compareField('title', title, actualValue(reread, 'title')))
  const releaseDate = stringField(payload.releaseDate).slice(0, 10)
  if (releaseDate) checks.push(compareField('release_date', releaseDate, actualValue(reread, 'release_date').slice(0, 10)))
  return checks
}

function compareField(field: string, expected: string, actual: string): WriteCheck {
  const left = normalize(expected)
  const right = normalize(actual)
  const matched = field === 'tracks' || expected === 'ISRC' ? Boolean(right) : left === right
  return { field, expected: expected.slice(0, 180), actual: actual.slice(0, 180), matched }
}

function actualValue(reread: Record<string, unknown>, field: string): string {
  const release = record(reread.release)
  if (field === 'upc' || field === 'previous_upc' || field === 'title' || field === 'type' || field === 'release_date') {
    return stringField(release?.[field])
  }
  const copy = record(release?.marketing_copy)
  if (copy && field in copy) return stringField(copy[field])
  const copyright = record(reread.copyright)
  const checks = record(copyright?.checks)
  if (checks && field in checks) return stringField(checks[field])
  return ''
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
