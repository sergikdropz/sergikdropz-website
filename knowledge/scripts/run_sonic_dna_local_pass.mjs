#!/usr/bin/env node
/**
 * Local Sonic DNA agent pass (no external LLM).
 * Rewrites stubbed DNA from measured BPM, energy, waveform stats, and library context.
 *
 * Usage:
 *   node knowledge/scripts/run_sonic_dna_local_pass.mjs
 *   node knowledge/scripts/run_sonic_dna_local_pass.mjs --library-only
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyMeasuredToDna, extractMeasured, sonicDnaStatusFromMeasured } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const homeRoot = path.join(repoRoot, 'deploy/home-server')
const catalogPath = path.join(repoRoot, 'knowledge/library-analysis/catalog.json')

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

const env = loadEnv(path.join(homeRoot, '.env'))
const api = (env.API_EXTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const serviceKey = env.SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error('[local-dna] Missing SERVICE_ROLE_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const libraryOnly = args.includes('--library-only')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

const PROFILES = {
  house: {
    name: 'House',
    subgenres: ['Deep House', 'Classic House', 'Tech House'],
    instrumentation: ['kick', 'offbeat hats', 'bassline', 'pads'],
    techniques: ['sidechain', 'four-on-the-floor', 'filter automation'],
    influences: ['Chicago house', 'UK garage pressure'],
    emotions: ['hypnotic', 'uplifting', 'grounded'],
    regions: ['Phoenix', 'American Southwest', 'warehouse circuit'],
    era: ['2010s underground house', 'classic 4/4 continuum'],
  },
  tech_house: {
    name: 'Tech House',
    subgenres: ['Minimal Tech House', 'Groovy Tech House'],
    instrumentation: ['driving kick', 'rolling hats', 'percussion', 'stabs'],
    techniques: ['tight compression', 'hypnotic loops', 'low-end control'],
    influences: ['UK tech house', 'minimal warehouse'],
    emotions: ['driving', 'focused', 'nocturnal'],
    regions: ['Phoenix', 'warehouse concrete'],
    era: ['2000s-2010s club techno-house'],
  },
  downtempo: {
    name: 'Downtempo',
    subgenres: ['Broken Beat', 'After-Hours', 'Head-nod'],
    instrumentation: ['swung drums', 'sub bass', 'pads', 'texture'],
    techniques: ['swing', 'space', 'filtered bass'],
    influences: ['downtempo electronics', 'late-night hip-hop'],
    emotions: ['introspective', 'warm', 'unhurried'],
    regions: ['Phoenix', 'after-hours rooms'],
    era: ['trip-hop / downtempo lineage'],
  },
  funk_fusion: {
    name: 'Funk Fusion',
    subgenres: ['Nu-Disco', 'Broken Funk', 'Groove'],
    instrumentation: ['syncopated drums', 'bass riff', 'keys', 'guitar chops'],
    techniques: ['swing pocket', 'live-feel quantization', 'warm saturation'],
    influences: ['funk memory', 'boogie', 'broken beat'],
    emotions: ['playful', 'soulful', 'physical'],
    regions: ['Phoenix', 'desert groove'],
    era: ['70s-80s funk filtered through electronics'],
  },
  reggae: {
    name: 'Reggae',
    subgenres: ['Dub', 'Steppers', 'Roots Electronics'],
    instrumentation: ['rimshot', 'offbeat skank', 'deep bass', 'delay throws'],
    techniques: ['dub delay', 'one-drop / steppers', 'bass weight'],
    influences: ['Jamaican dub', 'UK steppers'],
    emotions: ['grounded', 'meditative', 'heavy'],
    regions: ['Jamaica', 'Phoenix sound-system rooms'],
    era: ['roots-to-dub continuum'],
  },
  hip_hop: {
    name: 'Hip-Hop',
    subgenres: ['Boom Bap', 'Instrumental Hip-Hop', 'Head-nod'],
    instrumentation: ['boom-bap drums', 'sampled texture', 'bass', 'chops'],
    techniques: ['MPC pocket', 'chopped samples', 'vinyl grain'],
    influences: ['golden-era boom bap', 'instrumental hip-hop'],
    emotions: ['confident', 'laid-back', 'lyrical'],
    regions: ['Phoenix', 'US hip-hop lineage'],
    era: ['90s boom bap through modern instrumental'],
  },
  experimental: {
    name: 'Experimental',
    subgenres: ['Free-form Bass', 'Leftfield', 'IDM-adjacent'],
    instrumentation: ['irregular percussion', 'sound design bass', 'atmosphere'],
    techniques: ['sound design', 'unusual arrangement', 'texture-first mix'],
    influences: ['leftfield bass', 'experimental club'],
    emotions: ['curious', 'tense', 'exploratory'],
    regions: ['Phoenix', 'studio-internal geography'],
    era: ['contemporary leftfield electronics'],
  },
}

function profileFor(track) {
  const folder = `${(track.folders || []).join(' ')} ${(track.playlists || []).join(' ')} ${track.primaryGenre || ''}`.toLowerCase()
  if (folder.includes('reggae') || folder.includes('dub')) return PROFILES.reggae
  if (folder.includes('hip hop') || folder.includes('hip-hop')) return PROFILES.hip_hop
  if (folder.includes('experimental') || folder.includes('free form')) return PROFILES.experimental
  if (folder.includes('funk') || folder.includes('sendy') || track.bpmZone === 'funk_fusion') return PROFILES.funk_fusion
  if (track.bpmZone === 'downtempo') return PROFILES.downtempo
  if (track.bpmZone === 'tech_house' || (track.bpm || 0) > 128) return PROFILES.tech_house
  return PROFILES.house
}

function dynamicsLabel(crest) {
  const n = Number(crest) || 1
  if (n >= 1.6) return 'wide, punchy transients'
  if (n >= 1.3) return 'controlled punch with a steady body'
  return 'compressed, hypnotic density'
}

function energyLabel(energy) {
  const n = Number(energy) || 3
  if (n >= 4.2) return 'high-energy peak-time pressure'
  if (n >= 3.2) return 'mid-to-high floor energy'
  if (n >= 2.2) return 'warm mid-energy groove'
  return 'low-lit after-hours energy'
}

function buildDna(track) {
  const p = profileFor(track)
  const bpm = track.bpm
  const zone = track.bpmZone || 'house'
  const dyn = dynamicsLabel(track.waveform?.crest)
  const energy = energyLabel(track.energyLevel)
  const context = (track.playlists || track.folders || [])[0] || p.name
  const title = track.title || 'Untitled'
  const artist = track.artist || 'SERGIK'

  const summary = `${title} is a ${bpm || 'unmetered'}-BPM ${artist} cut in ${context}. Waveform ${dyn}; ${energy}. Genre/key stay unset until audio measurement (drum grid → tempo → bass lock).`
  const description = `${title} at ${bpm || 'an unconfirmed'} BPM. Waveform readings show ${dyn} (crest ${track.waveform?.crest ?? 'n/a'}). Folder "${context}" is crate context only — not a genre classification. Run measure_sonic_dna.py to fill drums, root/key, and groove genre.`
  const intention = `Hold a physical groove long enough that the room changes temperature — ${p.emotions[0]} first, then ${p.emotions[1] || 'release'}.`

  return {
    summary,
    description,
    intention,
    genres: {
      primaryGenres: [],
      subgenres: [],
      genreFusion: 'Unclassified until drum grid, tempo, and bass lock are measured from audio.',
      genreEvolution: 'Folder/playlist crates are not genre labels.',
    },
    musical: {
      keySignature: track.keySignature && track.keySignature !== 'Unknown' ? track.keySignature : 'Unknown',
      timeSignature: '4/4',
      instrumentation: p.instrumentation,
      rhythmicPatterns: `Unclassified groove at ${bpm || '?'} BPM until drum grid is measured. ${dyn}.`,
      harmonicComplexity: zone === 'downtempo' || zone === 'funk_fusion' ? 'Medium — chords and bass converse' : 'Focused — harmony serves the groove',
      productionTechniques: p.techniques,
      musicalInfluences: p.influences,
    },
    emotional: {
      primaryEmotions: p.emotions,
      emotionalJourney: `Opens patient, accumulates body, then holds ${p.emotions[0]} without cheap climax.`,
      psychologicalProfile: `${energy}; designed for collective movement more than private listening.`,
      moodTransitions: [],
    },
    technical: {
      bpm: track.bpm ?? null,
      energyLevel: track.energyLevel ?? null,
      danceability: track.danceabilityNormalized ?? null,
      technicalDescription: `Waveform peak ${track.waveform?.peak ?? 'n/a'}, RMS ${track.waveform?.rms ?? 'n/a'}, crest ${track.waveform?.crest ?? 'n/a'} — ${dyn}.`,
      frequencyBands: null,
    },
    regional: {
      primaryRegions: p.regions,
      culturalInfluences: [...p.influences, 'Phoenix warehouse culture'],
      regionalCharacteristics: 'Desert-heat patience and warehouse-concrete weight; the room is part of the arrangement.',
      crossCulturalElements: p.regions.slice(1),
    },
    historical: {
      eraInfluences: p.era,
      historicalContext: `A 2015–present SERGIK reading of ${p.era[0]}.`,
      evolutionFrom: p.influences,
      innovationPoints: ['Groove as argument', 'Environment-aware arrangement'],
    },
    drums: {},
    _metadata: {
      agent_pass: 'local-grounded-2026-08-19',
      compiled_from: 'waveform+metadata; genre/drums/key require measured audio',
    },
  }
}

async function rest(method, table, query, body) {
  const res = await fetch(`${api}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${table} ${res.status}: ${text.slice(0, 300)}`)
  }
}

const measuredDir = path.join(repoRoot, 'knowledge/library-analysis/measured')
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
let queue = catalog.filter((t) => (libraryOnly ? t.inLibrary : true))
if (limit) queue = queue.slice(0, limit)
console.log(`[local-dna] rewriting ${queue.length} tracks (partial unless measured audio exists)`)

let ok = 0
let fail = 0
const failures = []
for (const track of queue) {
  try {
    let dna = buildDna(track)
    const measuredPath = path.join(measuredDir, `${track.id}.json`)
    if (fs.existsSync(measuredPath)) {
      const measured = JSON.parse(fs.readFileSync(measuredPath, 'utf8'))
      const applied = applyMeasuredToDna(dna, measured)
      dna = applied.dna
    }
    const status = sonicDnaStatusFromMeasured(extractMeasured(dna))
    await rest('PATCH', 'audio_files', `?id=eq.${track.id}`, {
      sonic_dna: dna,
      ai_analysis: dna,
      sonic_dna_status: status,
      sonic_dna_error: null,
      sonic_dna_analyzed_at: new Date().toISOString(),
      analysis_status: status,
    })
    await rest('PATCH', 'music_library_tracks', `?audio_file_id=eq.${track.id}`, { sonic_dna: dna })
    ok += 1
    if (ok % 40 === 0) console.log(`[local-dna] ${ok}/${queue.length}`)
  } catch (error) {
    fail += 1
    failures.push({ id: track.id, title: track.title, error: error.message.slice(0, 160) })
  }
}

const report = { generatedAt: new Date().toISOString(), ok, fail, failures }
fs.writeFileSync(
  path.join(repoRoot, 'knowledge/library-analysis/agent-pass-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log('[local-dna] done', { ok, fail })

if (ok > 0) {
  const compiled = spawnSync(process.execPath, [path.join(__dirname, 'compile_library_analysis.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  process.exit(compiled.status || 0)
}
