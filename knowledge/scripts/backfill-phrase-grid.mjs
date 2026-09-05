#!/usr/bin/env node
/**
 * Backfill 16-step × 8-bar phrase grids onto measured Sonic DNA JSON.
 *
 * Default: expand kick/snare/hat bar steps into phrase steps (no audio remeasure).
 * Optional: --remeasure runs full DSP via sync-sonic-dna-analysis.mjs
 *
 * Usage:
 *   node knowledge/scripts/backfill-phrase-grid.mjs
 *   node knowledge/scripts/backfill-phrase-grid.mjs --dry-run
 *   node knowledge/scripts/backfill-phrase-grid.mjs --apply   # then apply to DB
 *   node knowledge/scripts/backfill-phrase-grid.mjs --remeasure
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
  console.log('[phrase-backfill] Running full DSP remeasure via sync…')
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'sync-sonic-dna-analysis.mjs'), '--remeasure', '--library-only'],
    { cwd: repoRoot, stdio: 'inherit' }
  )
  process.exit(r.status ?? 1)
}

if (!fs.existsSync(measuredDir)) {
  console.error('[phrase-backfill] No measured dir at', measuredDir)
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
    console.warn('[phrase-backfill] skip unreadable', name)
    skipped++
    continue
  }
  const before = JSON.stringify({
    k: measured.kickPhraseSteps,
    s: measured.snarePhraseSteps,
    h: measured.hatPhraseSteps,
    pb: measured.phraseBars,
    ko: measured.kickOnsetSec,
  })
  const next = ensurePhraseSteps(measured)
  const after = JSON.stringify({
    k: next.kickPhraseSteps,
    s: next.snarePhraseSteps,
    h: next.hatPhraseSteps,
    pb: next.phraseBars,
    ko: next.kickOnsetSec,
  })
  if (before === after) {
    skipped++
    continue
  }
  updated++
  if (dryRun) {
    console.log(`[phrase-backfill] would update ${name} (kicks=${(next.kickPhraseSteps || []).length})`)
    continue
  }
  fs.writeFileSync(full, `${JSON.stringify(next, null, 2)}\n`)
}

console.log(`[phrase-backfill] updated=${updated} skipped=${skipped} dryRun=${dryRun}`)

if (apply && !dryRun) {
  console.log('[phrase-backfill] Applying measured → DB…')
  const r = spawnSync(process.execPath, [path.join(__dirname, 'apply_sonic_dna_measured.mjs'), '--compile'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  process.exit(r.status ?? 0)
}
