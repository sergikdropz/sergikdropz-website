#!/usr/bin/env node
/**
 * Merge knowledge/library-analysis/measured/{id}.json into audio_files.sonic_dna.measured
 * and set sonic_dna_status to completed | partial from the quality gate.
 *
 * Usage:
 *   node knowledge/scripts/apply_sonic_dna_measured.mjs
 *   node knowledge/scripts/apply_sonic_dna_measured.mjs --live
 *   node knowledge/scripts/apply_sonic_dna_measured.mjs --id=1e0ff658 --dry-run
 *   node knowledge/scripts/apply_sonic_dna_measured.mjs --force-bpm
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyMeasuredToDna } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const homeRoot = path.join(repoRoot, 'deploy/home-server')
const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')

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
const forceBpm = args.includes('--force-bpm')
const idArg = args.find((a) => a.startsWith('--id='))?.split('=')[1]
const compile = args.includes('--compile')

const api = (
  live
    ? env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
    : env.API_EXTERNAL_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')
const serviceKey = live
  ? env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY
  : env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY

if (live && /127\.0\.0\.1|localhost/i.test(api)) {
  console.error('[apply-measured] --live needs hosted SUPABASE_URL in web/.env.local')
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

if (!fs.existsSync(measuredDir)) {
  console.error('[apply-measured] No measured dir. Run: python3 knowledge/scripts/measure_sonic_dna.py')
  process.exit(1)
}

const files = fs.readdirSync(measuredDir).filter((name) => name.endsWith('.json'))
const queue = idArg
  ? files.filter((name) => name.toLowerCase().startsWith(idArg.toLowerCase()))
  : files

if (!queue.length) {
  console.error('[apply-measured] No measured JSON files matched')
  process.exit(1)
}

if (!dryRun && !serviceKey) {
  console.error('[apply-measured] Missing SERVICE_ROLE_KEY (or pass --dry-run)')
  process.exit(1)
}

const UNKNOWN = new Set(['', 'unknown', 'n/a', 'none', 'null', 'unclassified'])

function isUsable(value) {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  const text = String(value).trim()
  return Boolean(text) && !UNKNOWN.has(text.toLowerCase())
}

function catalogLockFromRow(row, { ignoreBpm = false } = {}) {
  const overrides = row?.metadata?.catalog_overrides && typeof row.metadata.catalog_overrides === 'object'
    ? row.metadata.catalog_overrides
    : {}
  return {
    bpm: ignoreBpm
      ? undefined
      : (isUsable(overrides.bpm) ? overrides.bpm : (isUsable(row?.bpm) ? row.bpm : undefined)),
    key_signature: isUsable(overrides.key_signature)
      ? overrides.key_signature
      : (isUsable(row?.key_signature) ? row.key_signature : undefined),
    genre: isUsable(overrides.genre) ? overrides.genre : (isUsable(row?.genre) ? row.genre : undefined),
    subgenre: isUsable(overrides.subgenre)
      ? overrides.subgenre
      : (isUsable(row?.subgenre) ? row.subgenre : undefined),
  }
}

function overlayCatalogOnDna(dna, lock) {
  if (!dna || typeof dna !== 'object') return dna
  const next = { ...dna }
  if (isUsable(lock.bpm)) {
    next.technical = { ...(next.technical || {}), bpm: lock.bpm }
    next.measured = { ...(next.measured || {}), bpm: lock.bpm }
  }
  if (isUsable(lock.key_signature)) {
    next.technical = {
      ...(next.technical || {}),
      key: { ...(next.technical?.key || {}), key: lock.key_signature },
    }
    next.harmony = { ...(next.harmony || {}), keySignature: lock.key_signature }
    next.measured = { ...(next.measured || {}), key: lock.key_signature }
  }
  if (isUsable(lock.genre)) {
    const measured = next.measured || {}
    const prior = typeof measured.genre === 'object' && measured.genre ? measured.genre : {}
    const audioPrimary =
      prior.audioPrimary ||
      (prior.source === 'user-preferred' || prior.source === 'hybrid' ? null : prior.primary) ||
      null
    const audioSubgenre =
      prior.audioSubgenre ||
      (prior.source === 'user-preferred' || prior.source === 'hybrid' ? null : prior.subgenre) ||
      null
    const preferredPrimary = lock.genre
    const preferredSubgenre = lock.subgenre || null
    const audioLabel = [audioPrimary, audioSubgenre].filter(Boolean).join(' / ')
    const preferredLabel = [preferredPrimary, preferredSubgenre].filter(Boolean).join(' / ')
    const agree =
      audioPrimary &&
      preferredPrimary &&
      (String(audioPrimary).toLowerCase() === String(preferredPrimary).toLowerCase() ||
        String(audioPrimary).toLowerCase().includes(String(preferredPrimary).toLowerCase()) ||
        String(preferredPrimary).toLowerCase().includes(String(audioPrimary).toLowerCase()))
    const source = audioPrimary ? 'hybrid' : 'user-preferred'
    const judgment = audioPrimary
      ? agree
        ? `Hybrid judgment: catalog preference (${preferredLabel}) aligns with audio-measured groove (${audioLabel}).`
        : `Hybrid judgment: catalog preference is ${preferredLabel}; audio-measured groove reads ${audioLabel}. Honor both — preference as intent, audio as grid evidence.`
      : `Catalog preference is ${preferredLabel} (no audio groove class yet — confirm with DSP when available).`
    const genre = {
      ...prior,
      primary: preferredPrimary,
      subgenre: preferredSubgenre || prior.subgenre || null,
      source,
      audioPrimary,
      audioSubgenre,
      preferredPrimary,
      preferredSubgenre,
      judgment,
      reason: [
        ...(Array.isArray(prior.reason) ? prior.reason : []),
        audioPrimary ? `audio: ${audioLabel}` : null,
        `preferred: ${preferredLabel}`,
      ].filter(Boolean),
    }
    const intelligence = {
      ...(measured.intelligence || {}),
      description: [measured.intelligence?.description, judgment].filter(Boolean).join('\n\n'),
      genres: {
        ...(measured.intelligence?.genres || {}),
        primaryGenres: [preferredPrimary, audioPrimary].filter(Boolean),
        subgenres: [preferredSubgenre, audioSubgenre].filter(Boolean),
        genreFusion: judgment,
      },
    }
    next.measured = { ...measured, genre, intelligence }
    next.preferredGenre = {
      genre: preferredPrimary,
      subgenre: preferredSubgenre,
      savedAt: new Date().toISOString(),
    }
    if (!next.description) next.description = judgment
  }
  return next
}

async function loadLibraryLocks(audioFileId, libraryTrackId) {
  if (audioFileId) {
    const rows = await rest(
      'GET',
      'music_library_tracks',
      `?audio_file_id=eq.${audioFileId}&select=id,bpm,key_signature,genre,subgenre,metadata`,
    )
    return Array.isArray(rows) ? rows : []
  }
  if (libraryTrackId) {
    const rows = await rest(
      'GET',
      'music_library_tracks',
      `?id=eq.${libraryTrackId}&select=id,bpm,key_signature,genre,subgenre,metadata`,
    )
    return Array.isArray(rows) ? rows : []
  }
  return []
}

function fillOnlyCatalog(lock, measuredPatch) {
  const next = { ...measuredPatch }
  if (isUsable(lock.bpm)) delete next.bpm
  if (isUsable(lock.key_signature)) delete next.key_signature
  if (isUsable(lock.genre)) delete next.genre
  if (isUsable(lock.genre) || isUsable(lock.subgenre)) delete next.subgenre
  return next
}

async function resolveTargets(fileId) {
  const audioRows = await rest('GET', 'audio_files', `?id=eq.${fileId}&select=id,sonic_dna,bpm,key_signature`)
  if (audioRows?.[0]?.id) {
    return { audioFileId: audioRows[0].id, existing: audioRows[0].sonic_dna || {}, libraryTrackId: null }
  }
  const libRows = await rest(
    'GET',
    'music_library_tracks',
    `?id=eq.${fileId}&select=id,audio_file_id,sonic_dna`,
  )
  const lib = libRows?.[0]
  if (lib?.audio_file_id) {
    const linked = await rest(
      'GET',
      'audio_files',
      `?id=eq.${lib.audio_file_id}&select=id,sonic_dna,bpm,key_signature`,
    )
    return {
      audioFileId: lib.audio_file_id,
      existing: linked?.[0]?.sonic_dna || lib.sonic_dna || {},
      libraryTrackId: lib.id,
    }
  }
  if (lib?.id) {
    return { audioFileId: null, existing: lib.sonic_dna || {}, libraryTrackId: lib.id }
  }
  return { audioFileId: null, existing: {}, libraryTrackId: null }
}

console.log(`[apply-measured] target ${live ? 'live' : 'local'} (${queue.length} files)`)

const stats = { ok: 0, fail: 0, completed: 0, partial: 0, missing: 0 }
for (const name of queue) {
  const id = name.replace(/\.json$/, '')
  const measured = JSON.parse(fs.readFileSync(path.join(measuredDir, name), 'utf8'))
  try {
    let existing = {}
    let audioFileId = id
    let libraryTrackId = id
    if (!dryRun) {
      const resolved = await resolveTargets(id)
      audioFileId = resolved.audioFileId
      libraryTrackId = resolved.libraryTrackId || id
      existing = resolved.existing
      if (!audioFileId && !resolved.libraryTrackId) {
        stats.missing += 1
        console.warn(`[apply-measured] MISS ${id}`)
        continue
      }
    }
    const { dna, status } = applyMeasuredToDna(existing, measured)
    if (status === 'completed') stats.completed += 1
    else stats.partial += 1
    if (dryRun) {
      console.log(`[apply-measured] ${id} → ${status} ${measured.bpm} ${measured.key} ${measured.drumFamily} ${measured.genre?.primary}`)
      stats.ok += 1
      continue
    }
    const bpmInt = Number.isFinite(Number(measured.bpm)) ? Math.round(Number(measured.bpm)) : undefined
    const analyzedAt = new Date().toISOString()
    const primary = measured.genre?.primary
    const libraryRows = await loadLibraryLocks(audioFileId, libraryTrackId)
    const lock = catalogLockFromRow(libraryRows[0] || {}, { ignoreBpm: forceBpm })
    const dnaWithCatalog = overlayCatalogOnDna(dna, lock)
    const measuredAudio = {
      ...(isUsable(lock.bpm) ? { bpm: lock.bpm } : (bpmInt ? { bpm: bpmInt } : {})),
      ...(isUsable(lock.key_signature)
        ? { key_signature: lock.key_signature }
        : (measured.key ? { key_signature: measured.key } : {})),
    }
    const libraryCatalog = fillOnlyCatalog(lock, {
      ...(bpmInt ? { bpm: bpmInt } : {}),
      ...(measured.key ? { key_signature: measured.key } : {}),
      ...(primary && primary !== 'Unclassified' ? { genre: primary } : {}),
      ...(measured.genre?.subgenre ? { subgenre: measured.genre.subgenre } : {}),
    })
    let libraryMetadataPatch = {}
    if (forceBpm && libraryRows[0]?.metadata?.catalog_overrides?.bpm != null) {
      const metadata = { ...libraryRows[0].metadata }
      const overrides = { ...metadata.catalog_overrides }
      delete overrides.bpm
      if (Object.keys(overrides).length === 0) delete metadata.catalog_overrides
      else metadata.catalog_overrides = overrides
      libraryMetadataPatch = { metadata }
    }
    if (audioFileId) {
      await rest('PATCH', 'audio_files', `?id=eq.${audioFileId}`, {
        sonic_dna: dnaWithCatalog,
        sonic_dna_status: status,
        sonic_dna_error: null,
        sonic_dna_analyzed_at: analyzedAt,
        analysis_status: status,
        ...measuredAudio,
      })
      await rest('PATCH', 'music_library_tracks', `?audio_file_id=eq.${audioFileId}`, {
        sonic_dna: dnaWithCatalog,
        ...libraryCatalog,
        ...libraryMetadataPatch,
      })
    } else if (libraryTrackId) {
      await rest('PATCH', 'music_library_tracks', `?id=eq.${libraryTrackId}`, {
        sonic_dna: dnaWithCatalog,
        ...libraryCatalog,
        ...libraryMetadataPatch,
      })
    }
    stats.ok += 1
    console.log(`[apply-measured] ${id} ${status}`)
  } catch (error) {
    const cause = error.cause?.code || error.cause?.message || ''
    const detail = [error.message, cause].filter(Boolean).join(' ')
    stats.fail += 1
    console.warn(`[apply-measured] FAIL ${id}: ${detail.slice(0, 180)}`)
  }
}

console.log('[apply-measured] done', stats)

if (compile && stats.ok > 0 && !dryRun) {
  const compiled = spawnSync(process.execPath, [path.join(__dirname, 'compile_library_analysis.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  process.exit(compiled.status || 0)
}
