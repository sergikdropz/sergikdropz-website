#!/usr/bin/env node
/**
 * Keep Sonic DNA current for the whole catalog:
 *   1) reclassify/enrich measured JSON (optional full remeasure)
 *   2) apply into audio_files + music_library_tracks
 *   3) compile knowledge/library-analysis
 *   4) write sonic-dna-report.json
 *
 *   node knowledge/scripts/sync-sonic-dna-analysis.mjs
 *   node knowledge/scripts/sync-sonic-dna-analysis.mjs --live
 *   node knowledge/scripts/sync-sonic-dna-analysis.mjs --skip-db
 *   node knowledge/scripts/sync-sonic-dna-analysis.mjs --remeasure --library-only
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const args = process.argv.slice(2)
const skipDb = args.includes('--skip-db')
const live = args.includes('--live')
const remeasure = args.includes('--remeasure')
const libraryOnly = args.includes('--library-only')

function run(label, command, commandArgs) {
  console.log(`[sync-dna] ${label}`)
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

function mirrorIntelligence() {
  const pairs = [
    ['knowledge/sonic-dna/genre-intelligence.json', 'web/lib/audio/data/genre-intelligence.json'],
    ['knowledge/sonic-dna/genre-engine-rules.json', 'web/lib/audio/data/genre-engine-rules.json'],
  ]
  for (const [srcRel, destRel] of pairs) {
    const src = path.join(repoRoot, srcRel)
    const dest = path.join(repoRoot, destRel)
    if (!existsSync(src)) continue
    copyFileSync(src, dest)
    console.log(`[sync-dna] mirrored ${srcRel} → ${destRel}`)
  }
}

mirrorIntelligence()

const python = path.join(repoRoot, 'knowledge/scripts/.venv/bin/python')
const measureScript = path.join(repoRoot, 'knowledge/scripts/measure_sonic_dna.py')

if (remeasure) {
  const measureArgs = [measureScript]
  if (libraryOnly) measureArgs.push('--library-only')
  run('measure', python, measureArgs)
} else {
  run('reclassify+intelligence', python, [measureScript, '--reclassify-only'])
}

const applyArgs = [path.join(__dirname, 'apply_sonic_dna_measured.mjs')]
if (live) applyArgs.push('--live')
else applyArgs.push('--compile')
if (skipDb) {
  console.log('[sync-dna] skipping database apply (--skip-db)')
  run('compile', process.execPath, [path.join(__dirname, 'compile_library_analysis.mjs')])
} else {
  run('apply+compile', process.execPath, applyArgs)
}

run('report', process.execPath, [path.join(__dirname, 'report_sonic_dna.mjs')])
console.log('[sync-dna] done')
