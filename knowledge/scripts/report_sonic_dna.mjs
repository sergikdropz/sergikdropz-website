#!/usr/bin/env node
/**
 * Aggregate measured Sonic DNA into a library report (DSP-only, no folder genres).
 *
 *   node knowledge/scripts/report_sonic_dna.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')
const catalogPath = path.join(repoRoot, 'knowledge/library-analysis/catalog.json')
const goldPath = path.join(repoRoot, 'knowledge/library-analysis/gold-set.json')
const outPath = path.join(repoRoot, 'knowledge/library-analysis/sonic-dna-report.json')

function count(map, key) {
  if (!key) return
  map[key] = (map[key] || 0) + 1
}

function top(map, n = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }))
}

const files = fs.existsSync(measuredDir)
  ? fs.readdirSync(measuredDir).filter((name) => name.endsWith('.json'))
  : []
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : []
const gold = fs.existsSync(goldPath) ? JSON.parse(fs.readFileSync(goldPath, 'utf8')) : { tracks: [] }

const genres = {}
const drums = {}
const hatGrids = {}
const bassLocks = {}
const keys = {}
const instrumentIds = {}
const bpmBuckets = {}
const examples = []
let withReport = 0
let unpitched = 0

for (const name of files) {
  const measured = JSON.parse(fs.readFileSync(path.join(measuredDir, name), 'utf8'))
  const id = name.replace(/\.json$/, '')
  const title = catalog.find((row) => row.id === id)?.title || id
  count(genres, measured.genre?.primary || 'Unclassified')
  count(drums, measured.drumFamily || 'unknown')
  count(hatGrids, measured.percussion?.hatGrid || 'unknown')
  count(bassLocks, measured.bass?.lock || 'unknown')
  count(keys, measured.unpitched ? 'unpitched' : measured.key || 'unknown')
  if (measured.unpitched) unpitched += 1
  if (measured.report?.description) withReport += 1
  const bpm = Number(measured.bpm)
  if (Number.isFinite(bpm)) {
    const bucket = `${Math.floor(bpm / 5) * 5}–${Math.floor(bpm / 5) * 5 + 4}`
    count(bpmBuckets, bucket)
  }
  for (const inst of measured.instruments || []) {
    if ((inst.confidence || 0) >= 0.4) count(instrumentIds, inst.label)
  }
  if (examples.length < 8 && measured.report?.description) {
    examples.push({
      id,
      title,
      bpm: measured.bpm,
      key: measured.key,
      genre: measured.genre?.primary,
      drums: measured.drumFamily,
      hats: measured.percussion?.hatGrid,
      bass: measured.bass?.lock,
      instruments: (measured.instruments || []).slice(0, 4).map((item) => item.label),
      description: measured.report.description,
    })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  method: 'dsp-audit-v1',
  pipeline: [
    '16-step kick/snare/hat fold from audio',
    'BPM octave vs title BPM when present',
    'bass lock vs kick grid',
    'chroma root/key/Camelot',
    'band-energy instrument roles',
    'hat/snare/kick rhythm styles',
    'templated description from those fields only',
  ],
  caveats: [
    'Instrument labels are spectral roles, not named plugins or vocalist IDs.',
    'Playlist/folder names are crates, never genre.',
    'Gold-set tracks still need ear confirmation.',
  ],
  counts: {
    measuredFiles: files.length,
    catalogTracks: catalog.length,
    libraryTracks: catalog.filter((row) => row.inLibrary).length,
    withAuditedDescription: withReport,
    unpitched,
    goldSet: Array.isArray(gold.tracks) ? gold.tracks.length : 0,
  },
  genres: top(genres),
  drumFamilies: top(drums),
  hatGrids: top(hatGrids),
  bassLocks: top(bassLocks),
  keys: top(keys, 16),
  instruments: top(instrumentIds),
  bpmBuckets: top(bpmBuckets, 16),
  goldSet: gold.tracks || [],
  examples,
}

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log('[sonic-dna-report]', outPath)
console.log(JSON.stringify(report.counts, null, 2))
console.log('genres', report.genres)
