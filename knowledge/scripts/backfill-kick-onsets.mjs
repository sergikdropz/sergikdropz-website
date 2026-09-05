#!/usr/bin/env node
/**
 * Backfill kickOnsetSec (+ phrase steps) onto measured Sonic DNA JSON without audio.
 * Uses ensurePhraseSteps → ensureKickOnsetSec. For DSP onsets, pass --remeasure.
 *
 * Usage:
 *   node knowledge/scripts/backfill-kick-onsets.mjs
 *   node knowledge/scripts/backfill-kick-onsets.mjs --dry-run
 *   node knowledge/scripts/backfill-kick-onsets.mjs --apply
 *   node knowledge/scripts/backfill-kick-onsets.mjs --remeasure
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ensurePhraseSteps } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const apply = args.includes('--apply')
const remeasure = args.includes('--remeasure')

if (remeasure) {
  console.log('[kick-onset-backfill] Running full DSP remeasure via sync…')
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'sync-sonic-dna-analysis.mjs'), '--remeasure', '--library-only'],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  process.exit(r.status ?? 1)
}

if (!fs.existsSync(measuredDir)) {
  console.error('[kick-onset-backfill] No measured dir at', measuredDir)
  process.exit(1)
}

const files = fs.readdirSync(measuredDir).filter((n) => n.endsWith('.json'))
let updated = 0
let skipped = 0

for (const name of files) {
  const full = path.join(measuredDir, name)
  let measured
  try {
    measured = JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch {
    console.warn('[kick-onset-backfill] skip unreadable', name)
    skipped++
    continue
  }
  const beforeLen = Array.isArray(measured.kickOnsetSec) ? measured.kickOnsetSec.length : 0
  const next = ensurePhraseSteps(measured)
  const afterLen = Array.isArray(next.kickOnsetSec) ? next.kickOnsetSec.length : 0
  if (afterLen <= beforeLen && beforeLen >= 4) {
    skipped++
    continue
  }
  if (afterLen < 4) {
    skipped++
    continue
  }
  updated++
  if (dryRun) {
    console.log(`[kick-onset-backfill] would update ${name} (onsets ${beforeLen}→${afterLen})`)
    continue
  }
  fs.writeFileSync(full, `${JSON.stringify(next, null, 2)}\n`)
}

console.log(`[kick-onset-backfill] updated=${updated} skipped=${skipped} dryRun=${dryRun}`)

if (apply && !dryRun) {
  console.log('[kick-onset-backfill] Applying measured → DB…')
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'apply_sonic_dna_measured.mjs'), '--compile'],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  process.exit(r.status ?? 0)
}
