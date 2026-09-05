#!/usr/bin/env node
/**
 * Train / score the unified Sonic DNA genre engine against the gold set.
 *
 * Usage:
 *   node knowledge/scripts/train-genre-engine.mjs
 *   node knowledge/scripts/train-genre-engine.mjs --guidance "breaks / liquid dnb"
 *   node knowledge/scripts/train-genre-engine.mjs --write-proposals
 *
 * Also mirrors encyclopedia + engine rules into web/lib/audio/data/.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const webRoot = join(root, 'web')
const knowledgeSonic = join(root, 'knowledge/sonic-dna')
const measuredDir = join(root, 'knowledge/library-analysis/measured')
const goldPath = join(root, 'knowledge/library-analysis/gold-set.json')
const reportPath = join(root, 'knowledge/library-analysis/genre-engine-scorecard.json')
const proposalsPath = join(root, 'knowledge/library-analysis/genre-engine-proposals.json')

function syncMirrors() {
  const pairs = [
    ['genre-intelligence.json', 'genre-intelligence.json'],
    ['genre-engine-rules.json', 'genre-engine-rules.json'],
  ]
  for (const [srcName, destName] of pairs) {
    const src = join(knowledgeSonic, srcName)
    const dest = join(webRoot, 'lib/audio/data', destName)
    if (!existsSync(src)) continue
    copyFileSync(src, dest)
    console.log(`[train-genre-engine] mirrored ${srcName} → web/lib/audio/data/${destName}`)
  }
}

function parseArgs(argv) {
  const guidanceIdx = argv.indexOf('--guidance')
  return {
    writeProposals: argv.includes('--write-proposals'),
    guidance: guidanceIdx >= 0 ? String(argv[guidanceIdx + 1] || '').trim() : '',
  }
}

async function loadEngine() {
  // Prefer compiled TS via vitest/tsx path — use dynamic import of built alias through node with tsx if available.
  const require = createRequire(import.meta.url)
  try {
    // When run via `npm run sonic-dna:train-genre` we register tsx from web.
    const mod = await import(pathToFileURL(join(webRoot, 'lib/audio/genre-engine.ts')).href)
    return mod
  } catch {
    // Fallback: evaluate score in-process with a minimal port by spawning vitest? Prefer tsx require.
    try {
      require('tsx/cjs')
      return require(join(webRoot, 'lib/audio/genre-engine.ts'))
    } catch (err) {
      throw new Error(`Unable to load genre-engine.ts — run from web with tsx. ${err?.message || err}`)
    }
  }
}

function loadMeasuredById() {
  const out = {}
  if (!existsSync(measuredDir)) return out
  for (const file of readdirSync(measuredDir)) {
    if (!file.endsWith('.json')) continue
    const id = file.replace(/\.json$/, '')
    try {
      const raw = JSON.parse(readFileSync(join(measuredDir, file), 'utf8'))
      const measured = raw.measured || raw
      out[id] = {
        bpm: measured.bpm,
        drumFamily: measured.drumFamily,
        bass: measured.bass,
        timingFeel: measured.timingFeel,
        swingPercent: measured.swingPercent,
        percussion: measured.percussion,
        instruments: measured.instruments,
        fourRatio: measured.fourRatio ?? raw.fourRatio,
        snareSteps: measured.snareSteps,
        spectral: measured.spectral,
      }
    } catch {
      /* skip bad file */
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  syncMirrors()

  const gold = JSON.parse(readFileSync(goldPath, 'utf8'))
  const measuredById = loadMeasuredById()
  const engine = await loadEngine()

  const scorecard = engine.scoreGenreEngineAgainstGold(gold.tracks || [], measuredById)
  const proposals = engine.proposeGenreEngineUpdates({
    scorecard,
    adminGuidance: args.guidance,
  })

  const report = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    goldTracks: (gold.tracks || []).length,
    measuredAvailable: Object.keys(measuredById).length,
    scorecard: {
      total: scorecard.total,
      primaryHits: scorecard.primaryHits,
      familyHits: scorecard.familyHits,
      primaryAccuracy: Number(scorecard.primaryAccuracy.toFixed(4)),
      familyAccuracy: Number(scorecard.familyAccuracy.toFixed(4)),
      mismatches: scorecard.mismatches,
    },
    proposals,
    guidance: args.guidance || null,
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(
    `[train-genre-engine] gold ${scorecard.total}/${(gold.tracks || []).length} scored — primary ${(scorecard.primaryAccuracy * 100).toFixed(1)}% family ${(scorecard.familyAccuracy * 100).toFixed(1)}%`,
  )
  if (scorecard.mismatches.length) {
    console.log(`[train-genre-engine] mismatches:`)
    for (const row of scorecard.mismatches) {
      console.log(`  - ${row.title || row.id}: expected ${row.expectedPrimary} → got ${row.predictedPrimary}`)
    }
  }
  if (args.writeProposals) {
    writeFileSync(proposalsPath, JSON.stringify({ generatedAt: report.generatedAt, proposals }, null, 2))
    console.log(`[train-genre-engine] wrote proposals → ${proposalsPath}`)
  }
  console.log(`[train-genre-engine] scorecard → ${reportPath}`)
}

main().catch((err) => {
  console.error('[train-genre-engine] failed', err)
  process.exit(1)
})
