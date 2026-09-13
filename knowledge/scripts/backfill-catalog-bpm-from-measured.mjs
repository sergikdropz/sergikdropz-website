#!/usr/bin/env node
/**
 * Force-update catalog + Sonic DNA BPM from knowledge/library-analysis/measured/*.json.
 * Clears metadata.catalog_overrides.bpm so locked wrong/half tempos stop winning.
 *
 * Usage:
 *   node knowledge/scripts/backfill-catalog-bpm-from-measured.mjs --dry-run
 *   node knowledge/scripts/backfill-catalog-bpm-from-measured.mjs
 *   node knowledge/scripts/backfill-catalog-bpm-from-measured.mjs --live
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMeasuredToDna } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const homeRoot = path.join(repoRoot, 'deploy/home-server')
const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')
const TITLE_BPM_RE = /(?<!\d)(\d{2,3})\s*bpm/i

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = {
  ...loadEnv(path.join(homeRoot, '.env')),
  ...loadEnv(path.join(repoRoot, 'web/.env.local')),
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const live = args.includes('--live')
const writeMeasured = !args.includes('--no-write-measured')

const api = (
  live
    ? env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
    : env.API_EXTERNAL_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')
const serviceKey = live
  ? env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY
  : env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (live && /127\.0\.0\.1|localhost/i.test(api)) {
  console.error('[backfill-bpm] --live needs hosted SUPABASE_URL in web/.env.local')
  process.exit(1)
}

if (!dryRun && !serviceKey) {
  console.error('[backfill-bpm] Missing SERVICE_ROLE_KEY (or pass --dry-run)')
  process.exit(1)
}

async function rest(method, table, query, body) {
  const res = await fetch(`${api}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${table} ${res.status}: ${text.slice(0, 300)}`)
  }
  if (method === 'GET') return res.json()
  return null
}

function parseTitleBpm(title) {
  const match = String(title || '').match(TITLE_BPM_RE)
  if (!match) return null
  const bpm = Number(match[1])
  return bpm >= 60 && bpm <= 200 ? bpm : null
}

/**
 * Prefer DSP measured BPM; fix half-tempo catalog mistakes; keep jungle/DnB doubles when measure lands ~half.
 */
export function resolveProperBpm({ measuredBpm, catalogBpm, title, drumFamily }) {
  const raw = Number(measuredBpm)
  if (!Number.isFinite(raw) || raw < 55 || raw > 220) return null

  const titleBpm = parseTitleBpm(title)
  if (titleBpm) return { bpm: titleBpm, reason: 'title' }

  const bpm = Math.round(raw)
  const doubled = Math.round(raw * 2)
  const catalog = Number(catalogBpm)
  const drums = String(drumFamily || '').toLowerCase()
  const hasCatalog = Number.isFinite(catalog) && catalog >= 60 && catalog <= 200

  // Locked catalog is half of measured (e.g. 59 vs 117) → measured wins
  if (hasCatalog && catalog < 95 && Math.abs(catalog * 2 - bpm) <= 5) {
    return { bpm, reason: 'measured-fix-catalog-half' }
  }

  // Jungle/DnB: catalog ~160–185 while DSP reads ~half → keep catalog
  if (hasCatalog && catalog >= 150 && catalog <= 185 && bpm < 120) {
    const ratio = bpm / catalog
    if ((ratio >= 0.55 && ratio <= 0.72) || Math.abs(doubled - catalog) <= 12) {
      return { bpm: Math.round(catalog), reason: 'keep-catalog-double-time' }
    }
  }

  if (bpm < 115 && doubled >= 120 && doubled <= 185) {
    const catalogAgreesDouble = hasCatalog && Math.abs(catalog - doubled) <= 6
    const jungleRange = doubled >= 160 && doubled <= 180
    const breakish = /break|half-time|amen/.test(drums)
    if (catalogAgreesDouble || (jungleRange && breakish)) {
      return { bpm: doubled, reason: catalogAgreesDouble ? 'double-from-catalog' : 'double-jungle' }
    }
  }

  return { bpm, reason: 'measured' }
}

function clearBpmOverride(metadata) {
  const next = metadata && typeof metadata === 'object' ? { ...metadata } : {}
  const overrides = next.catalog_overrides && typeof next.catalog_overrides === 'object'
    ? { ...next.catalog_overrides }
    : null
  if (!overrides || overrides.bpm == null) return { metadata: next, cleared: false }
  delete overrides.bpm
  if (Object.keys(overrides).length === 0) delete next.catalog_overrides
  else next.catalog_overrides = overrides
  return { metadata: next, cleared: true }
}

function findMeasuredPath(ids) {
  for (const id of ids) {
    if (!id) continue
    const p = path.join(measuredDir, `${id}.json`)
    if (fs.existsSync(p)) return p
  }
  return null
}

const tracks = await rest(
  'GET',
  'music_library_tracks',
  '?select=id,title,bpm,audio_file_id,metadata,sonic_dna&or=(is_archived.is.null,is_archived.eq.false)&order=title.asc',
)

const stats = {
  total: tracks.length,
  updated: 0,
  unchanged: 0,
  skippedNoMeasure: 0,
  doubled: 0,
  clearedLock: 0,
  fail: 0,
}
const changes = []

console.log(`[backfill-bpm] target ${live ? 'live' : 'local'} (${tracks.length} tracks)${dryRun ? ' DRY-RUN' : ''}`)

for (const track of tracks) {
  const measuredPath = findMeasuredPath([track.id, track.audio_file_id])
  if (!measuredPath) {
    stats.skippedNoMeasure += 1
    continue
  }

  try {
    const measured = JSON.parse(fs.readFileSync(measuredPath, 'utf8'))
    const resolved = resolveProperBpm({
      measuredBpm: measured.bpm,
      catalogBpm: track.bpm,
      title: track.title,
      drumFamily: measured.drumFamily || track.sonic_dna?.measured?.drumFamily,
    })
    if (!resolved) {
      stats.skippedNoMeasure += 1
      continue
    }

    const nextBpm = resolved.bpm
    const priorBpm = Number(track.bpm)
    const dnaBpm = Number(track.sonic_dna?.measured?.bpm)
    const { metadata, cleared } = clearBpmOverride(track.metadata)
    const needsBpm = !Number.isFinite(priorBpm) || Math.abs(priorBpm - nextBpm) >= 1
    const needsDna = !Number.isFinite(dnaBpm) || Math.abs(dnaBpm - nextBpm) >= 1
    const needsWrite = needsBpm || needsDna || cleared

    if (!needsWrite) {
      stats.unchanged += 1
      continue
    }

    if (resolved.reason.startsWith('double')) stats.doubled += 1
    if (cleared) stats.clearedLock += 1

    const measuredNext = {
      ...measured,
      bpm: nextBpm,
      bpmConfidence: Math.max(Number(measured.bpmConfidence || 0), resolved.reason === 'measured' ? 0 : 0.7),
      bpmSource: resolved.reason,
    }
    const { dna } = applyMeasuredToDna(track.sonic_dna || {}, measuredNext)
    if (dna?.measured) dna.measured.bpm = nextBpm
    if (dna?.technical) dna.technical.bpm = nextBpm

    changes.push({
      title: track.title,
      from: Number.isFinite(priorBpm) ? priorBpm : null,
      to: nextBpm,
      reason: resolved.reason,
      clearedLock: cleared,
    })

    if (dryRun) {
      stats.updated += 1
      continue
    }

    if (writeMeasured && Math.abs(Number(measured.bpm) - nextBpm) >= 1) {
      fs.writeFileSync(measuredPath, `${JSON.stringify(measuredNext, null, 2)}\n`)
    }

    const patch = {
      bpm: nextBpm,
      sonic_dna: dna,
      metadata,
    }
    await rest('PATCH', 'music_library_tracks', `?id=eq.${track.id}`, patch)

    if (track.audio_file_id) {
      await rest('PATCH', 'audio_files', `?id=eq.${track.audio_file_id}`, {
        bpm: nextBpm,
        sonic_dna: dna,
      })
    }

    stats.updated += 1
  } catch (error) {
    stats.fail += 1
    console.warn(`[backfill-bpm] FAIL ${track.title}: ${String(error.message || error).slice(0, 180)}`)
  }
}

for (const row of changes.slice(0, 40)) {
  console.log(
    `  ${row.from ?? '—'} → ${row.to}  ${row.reason}${row.clearedLock ? ' (cleared lock)' : ''}  ${row.title}`,
  )
}
if (changes.length > 40) console.log(`  … +${changes.length - 40} more`)

console.log('[backfill-bpm] done', stats)
