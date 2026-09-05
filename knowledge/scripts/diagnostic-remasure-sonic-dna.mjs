#!/usr/bin/env node
/**
 * Budget-friendly Sonic DNA remasure using local Exports WAVs when available,
 * with optional MP3 fallback for library tracks that have no WAV master.
 *
 * Usage:
 *   node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --dry-run
 *   node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --library-only
 *   node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --library-only --mp3-fallback
 *   node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --library-only --mp3-fallback --apply --live
 *   node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --missing-only
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const libraryOnly = args.includes('--library-only')
const missingOnly = args.includes('--missing-only')
const mp3Fallback = args.includes('--mp3-fallback')
const apply = args.includes('--apply')
const live = args.includes('--live')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

const EXPORT_ROOTS = [
  process.env.SERGIK_AUDIO_ROOT,
  '/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs',
  '/Volumes/SERGIK/Exports SERGIK/SERGIK MP3s',
  '/Volumes/SERGIK/Exports SERGIK',
  path.join(process.env.HOME || '', 'Music/MP3 Exports'),
  path.join(repoRoot, 'web/public/audio'),
].filter(Boolean)

const python = path.join(repoRoot, 'knowledge/scripts/.venv/bin/python')
const measureScript = path.join(repoRoot, 'knowledge/scripts/measure_sonic_dna.py')
const catalogPath = path.join(repoRoot, 'knowledge/library-analysis/catalog.json')
const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function indexAudio(roots, extRe) {
  const exact = new Map()
  const norm = new Map()
  let count = 0
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop()
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name)
        if (ent.name.startsWith('._')) continue
        if (ent.isDirectory()) {
          stack.push(full)
          continue
        }
        if (!extRe.test(ent.name)) continue
        exact.set(ent.name.toLowerCase(), full)
        norm.set(normalizeName(path.parse(ent.name).name), full)
        count++
      }
    }
  }
  return { exact, norm, count }
}

function resolveAudio(entry, rec, index) {
  const identity = rec?.identity || {}
  const candidates = [
    identity.fileName,
    identity.filePath && path.basename(identity.filePath),
    entry.title,
    entry.file && path.basename(String(entry.file)),
  ].filter(Boolean)

  for (const cand of candidates) {
    const base = path.basename(String(cand))
    const stem = path.parse(base).name
    for (const name of [base, `${stem}.wav`, `${stem}.mp3`]) {
      const hit = index.exact.get(name.toLowerCase())
      if (hit) return hit
    }
    const key = normalizeName(stem)
    if (index.norm.has(key)) return index.norm.get(key)
  }
  return null
}

function needsRemeasure(entry) {
  const dest = path.join(measuredDir, `${entry.id}.json`)
  if (!fs.existsSync(dest)) return { reason: 'missing' }
  if (missingOnly) return null
  try {
    const m = JSON.parse(fs.readFileSync(dest, 'utf8'))
    if (!m.clapSteps) return { reason: 'no-clap-band' }
    const bpmOk = typeof m.bpm === 'number' && (m.bpmConfidence ?? 0) >= 0.4
    const drumsOk =
      m.drumFamily &&
      m.drumFamily !== 'unknown' &&
      ((m.kickSteps && m.kickSteps.length) || (m.snareSteps && m.snareSteps.length))
    const keyOk = m.unpitched || m.key || m.rootNote
    if (!(bpmOk && drumsOk && keyOk)) return { reason: 'partial' }
  } catch {
    return { reason: 'corrupt' }
  }
  if (mp3Fallback) return null
  return { reason: 'refresh-clap-dsp' }
}

function loadTrackRecord(entry) {
  if (!entry.file) return entry
  const p = path.join(repoRoot, 'knowledge/library-analysis', entry.file)
  if (!fs.existsSync(p)) return entry
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function run(label, command, commandArgs) {
  console.log(`[diagnostic-remasure] ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NUMBA_CACHE_DIR:
        process.env.NUMBA_CACHE_DIR || path.join(repoRoot, 'knowledge/scripts/.numba_cache'),
    },
  })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`)
  }
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
let queue = catalog
if (libraryOnly) queue = queue.filter((t) => t.inLibrary)

const wavIndex = indexAudio(EXPORT_ROOTS, /\.(wav|aiff|aif|flac)$/i)
const mp3Index = indexAudio(EXPORT_ROOTS, /\.mp3$/i)
console.log(
  `[diagnostic-remasure] indexed wav=${wavIndex.count} mp3=${mp3Index.count} under`,
  EXPORT_ROOTS.filter((r) => fs.existsSync(r)).join(', ') || '(none mounted)'
)

const plan = []
for (const entry of queue) {
  const need = needsRemeasure(entry)
  if (!need) continue
  const rec = loadTrackRecord(entry)
  const wav = resolveAudio(entry, rec, wavIndex)
  const mp3 = wav ? null : resolveAudio(entry, rec, mp3Index)
  plan.push({
    id: entry.id,
    title: entry.title || rec?.identity?.title || entry.id,
    reason: need.reason,
    wav,
    mp3,
  })
}

const withWav = plan.filter((p) => p.wav)
const withMp3Only = plan.filter((p) => !p.wav && p.mp3)
const unresolved = plan.filter((p) => !p.wav && !p.mp3)
const measurable = mp3Fallback
  ? plan.filter((p) => p.wav || p.mp3).slice(0, Number.isFinite(limit) ? limit : Infinity)
  : withWav.slice(0, Number.isFinite(limit) ? limit : withWav.length)

console.log(
  JSON.stringify(
    {
      planned: plan.length,
      withLocalWav: withWav.length,
      withMp3Only: withMp3Only.length,
      unresolved: unresolved.length,
      willMeasure: measurable.length,
      unresolvedSample: unresolved.slice(0, 8).map((p) => p.title),
      mode: mp3Fallback ? 'wav+mp3-fallback' : 'wav-primary',
    },
    null,
    2
  )
)

if (dryRun) {
  console.log('[diagnostic-remasure] dry-run only — no measure')
  process.exit(0)
}

if (!fs.existsSync(python)) {
  console.error('[diagnostic-remasure] missing venv python at', python)
  process.exit(1)
}

if (measurable.length === 0) {
  console.log('[diagnostic-remasure] nothing to measure')
  if (!apply) process.exit(0)
} else {
  const measureArgs = [measureScript]
  if (libraryOnly) measureArgs.push('--library-only')
  // When filling gaps (missing / no-clap / mp3 fallback), only remasure those.
  if (mp3Fallback || missingOnly) measureArgs.push('--needs-clap')
  for (const root of EXPORT_ROOTS) {
    measureArgs.push('--audio-root', root)
  }
  run(`measure (${measurable.length} planned, mode=${mp3Fallback ? 'wav+mp3' : 'wav'})`, python, measureArgs)
}

if (apply) {
  const syncArgs = [path.join(__dirname, 'sync-sonic-dna-analysis.mjs')]
  if (live) syncArgs.push('--live')
  run('apply+compile+report', process.execPath, syncArgs)
} else {
  console.log('[diagnostic-remasure] measured JSON updated. Apply with:')
  console.log(
    '  node knowledge/scripts/diagnostic-remasure-sonic-dna.mjs --library-only --mp3-fallback --apply --live'
  )
}
