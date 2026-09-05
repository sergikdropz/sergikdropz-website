#!/usr/bin/env node
/**
 * Full Sonic DNA agent pass: rewrite stubbed analysis with Claude Haiku,
 * grounded in BPM/energy/waveform stats/folder context, then write back
 * to home-server audio_files + music_library_tracks.
 *
 * Usage:
 *   node knowledge/scripts/run_sonic_dna_agent_pass.mjs
 *   node knowledge/scripts/run_sonic_dna_agent_pass.mjs --library-only --limit=5
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { applyMeasuredToDna, extractMeasured, sonicDnaStatusFromMeasured } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const webRoot = path.join(repoRoot, 'web')
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

const env = {
  ...loadEnv(path.join(homeRoot, '.env')),
  ...loadEnv(path.join(webRoot, '.env.local')),
  ...loadEnv(path.join(webRoot, '.env.local.cloud.bak')),
}

const api = (env.API_EXTERNAL_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const serviceKey = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = env.ANTHROPIC_API_KEY
if (!serviceKey) {
  console.error('[dna-pass] Missing SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!anthropicKey) {
  console.error('[dna-pass] Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const libraryOnly = args.includes('--library-only')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 2)
const force = args.includes('--force')

function repairJson(jsonText) {
  return String(jsonText || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/^\s*\/\/.*$/gm, '')
}

function parseJsonFromText(content) {
  let jsonText = String(content || '').trim()
  const fenced = jsonText.match(/```json\s*([\s\S]*?)\s*```/) || jsonText.match(/```\s*([\s\S]*?)\s*```/)
  if (fenced) jsonText = fenced[1].trim()
  if (!jsonText.startsWith('{')) {
    const first = jsonText.indexOf('{')
    const last = jsonText.lastIndexOf('}')
    if (first >= 0 && last > first) jsonText = jsonText.slice(first, last + 1)
  }
  const attempts = [jsonText, jsonText.replace(/,\s*([}\]])/g, '$1'), repairJson(jsonText)]
  let lastErr
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt)
    } catch (error) {
      lastErr = error
    }
  }
  const errPath = path.join(repoRoot, 'knowledge/library-analysis/.last-dna-parse-error.txt')
  fs.writeFileSync(errPath, jsonText)
  throw lastErr
}

async function anthropicMessage(model, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`${model} ${res.status}`)
    err.status = res.status
    throw err
  }
  const data = JSON.parse(text)
  const content = data?.content?.[0]?.text
  if (!content) throw new Error(`${model} empty content`)
  return content
}

async function callHaiku(prompt) {
  const preferred = env.ANTHROPIC_CHAT_MODEL
  const models = [
    preferred && !/claude-3/.test(preferred) ? preferred : null,
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5',
    'claude-sonnet-4-5',
  ].filter(Boolean)
  const tried = []
  let lastError = null
  for (const model of models) {
    try {
      const content = await anthropicMessage(model, prompt)
      try {
        return parseJsonFromText(content)
      } catch {
        const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous reply was invalid JSON. Reply with minified valid JSON only. No markdown, no trailing commas, escape all quotes inside strings.`
        const retry = await anthropicMessage(model, retryPrompt)
        return parseJsonFromText(retry)
      }
    } catch (error) {
      lastError = error
      tried.push(`${model}:${error.status || error.message}`)
      if (error.status && error.status !== 404) continue
      continue
    }
  }
  throw new Error(`Anthropic call failed (${tried.join(', ') || lastError?.message || 'unknown'})`)
}

async function rest(method, table, query, body) {
  const url = `${api}/rest/v1/${table}${query || ''}`
  const res = await fetch(url, {
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
    throw new Error(`${method} ${table} ${res.status}: ${text.slice(0, 400)}`)
  }
  if (method === 'GET') return res.json()
  return null
}

function loadMeasured(trackId) {
  const measuredPath = path.join(repoRoot, 'knowledge/library-analysis/measured', `${trackId}.json`)
  if (!fs.existsSync(measuredPath)) return null
  try {
    return JSON.parse(fs.readFileSync(measuredPath, 'utf8'))
  } catch {
    return null
  }
}

function buildPrompt(track) {
  const wf = track.waveform || {}
  const measured = track.measured
  const measuredBlock = measured
    ? `DSP MEASURED (immutable — copy these numbers; do not invent genre/key/BPM that contradict them):
- BPM: ${measured.bpm} (confidence ${measured.bpmConfidence}, titleBpm ${measured.titleBpm ?? 'n/a'})
- Timing: ${measured.timingFeel} effective ${measured.effectiveBpm}
- Drum family: ${measured.drumFamily}
- Kick steps: ${(measured.kickSteps || []).join(', ') || 'none'}
- Snare steps: ${(measured.snareSteps || []).join(', ') || 'none'}
- Hat steps: ${(measured.hatSteps || []).join(', ') || 'none'}
- Bass lock: ${measured.bass?.lock || 'unknown'} root ${measured.rootNote || 'n/a'}
- Key/scale: ${measured.key || 'Unknown'} camelot ${measured.camelot || 'n/a'}
- Groove genre: ${measured.genre?.primary || 'Unclassified'} (${measured.genre?.family || ''}) — ${(measured.genre?.reason || []).join('; ')}
Folders/playlists are crate names only, not genre.`
    : `DSP MEASURED: none. You MUST set musical.keySignature to "Unknown", genres.primaryGenres to [], and do not guess a parent genre from folder names or BPM zone.`

  return `You are SERGIK AI, musicologist for SERGIK (Phoenix AZ underground electronic producer/DJ). Write Sonic DNA prose around immutable DSP facts. Do not use placeholders like "Analysis pending".

${measuredBlock}

CONTEXT (not genre labels):
- Title: ${track.title}
- Artist: ${track.artist}
- Catalog BPM field: ${track.bpm ?? 'n/a'} (zone: ${track.bpmZone})
- Energy: ${track.energyLevel ?? 'n/a'}
- Danceability: ${track.danceabilityNormalized ?? 'n/a'}
- Duration sec: ${track.durationSeconds ?? 'n/a'}
- Library folders: ${(track.folders || []).join(', ') || 'none'}
- Playlists: ${(track.playlists || []).join(', ') || 'none'}
- Waveform peak/rms/crest: ${wf.peak ?? 'n/a'} / ${wf.rms ?? 'n/a'} / ${wf.crest ?? 'n/a'}

SERGIK DNA: groove-forward; rhythm is the argument. Genre order is drum pattern → tempo/feel → bass lock.

Return ONLY valid minified JSON (no markdown). Keep every string on one line. Use this exact shape:
{
  "summary": "2-3 sentence sonic identity",
  "description": "80-100 word critic-style description",
  "intention": "1-2 sentences on the feeling it aims to create",
  "genres": {
    "primaryGenres": ["..."],
    "subgenres": ["..."],
    "genreFusion": "one sentence",
    "genreEvolution": "one sentence"
  },
  "musical": {
    "keySignature": ${measured?.key ? JSON.stringify(measured.key) : '"Unknown"'},
    "timeSignature": "4/4",
    "instrumentation": ["..."],
    "rhythmicPatterns": "one sentence",
    "harmonicComplexity": "one sentence",
    "productionTechniques": ["..."],
    "musicalInfluences": ["..."]
  },
  "emotional": {
    "primaryEmotions": ["..."],
    "emotionalJourney": "one sentence",
    "psychologicalProfile": "one sentence",
    "moodTransitions": []
  },
  "technical": {
    "bpm": ${Number(measured?.bpm ?? track.bpm) || 0},
    "energyLevel": ${Number(track.energyLevel) || 0},
    "danceability": ${Number(track.danceabilityNormalized) || 0},
    "technicalDescription": "one sentence on groove/dynamics from the waveform stats"
  },
  "regional": {
    "primaryRegions": ["Phoenix", "American Southwest"],
    "culturalInfluences": ["..."],
    "regionalCharacteristics": "one sentence",
    "crossCulturalElements": ["..."]
  },
  "historical": {
    "eraInfluences": ["..."],
    "historicalContext": "one sentence",
    "evolutionFrom": ["..."],
    "innovationPoints": ["..."]
  }
}`
}

function isThin(track) {
  const s = String(track.summary || '')
  return (
    force ||
    s.length < 40 ||
    /^sergik\s*[—-]/i.test(s) ||
    /analysis pending/i.test(s)
  )
}

async function updateTrack(track, dna) {
  const measured = track.measured || extractMeasured(dna)
  const applied = applyMeasuredToDna(dna, measured)
  const compiled = {
    ...applied.dna,
    technical: {
      ...(applied.dna.technical || {}),
      bpm: measured?.bpm ?? track.bpm ?? dna.technical?.bpm ?? null,
      energyLevel: track.energyLevel ?? dna.technical?.energyLevel ?? null,
      danceability: track.danceabilityNormalized ?? dna.technical?.danceability ?? null,
    },
    _metadata: {
      ...(applied.dna._metadata || {}),
      agent_pass: 'haiku-4-5-2026-08-19',
      compiled_from: measured ? 'dsp-measured+prose' : 'waveform+metadata-partial',
    },
  }
  const status = sonicDnaStatusFromMeasured(extractMeasured(compiled))
  await rest('PATCH', 'audio_files', `?id=eq.${track.id}`, {
    sonic_dna: compiled,
    ai_analysis: compiled,
    sonic_dna_status: status,
    sonic_dna_error: null,
    sonic_dna_analyzed_at: new Date().toISOString(),
    analysis_status: status,
  })
  await rest('PATCH', 'music_library_tracks', `?audio_file_id=eq.${track.id}`, {
    sonic_dna: compiled,
  })
}

async function pool(items, n, fn) {
  let i = 0
  const results = []
  async function worker() {
    while (i < items.length) {
      const idx = i
      i += 1
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return results
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
let queue = catalog.filter((t) => (libraryOnly ? t.inLibrary : true)).filter(isThin)
if (limit) queue = queue.slice(0, limit)

console.log(`[dna-pass] ${queue.length} tracks (libraryOnly=${libraryOnly} force=${force} concurrency=${concurrency})`)

const stats = { ok: 0, skip: 0, fail: 0 }
const failures = []

await pool(queue, concurrency, async (track, idx) => {
  try {
    const measured = loadMeasured(track.id)
    const dna = await callHaiku(buildPrompt({ ...track, measured }))
    if (!dna?.summary || !dna?.genres) throw new Error('incomplete JSON')
    await updateTrack({ ...track, measured }, dna)
    stats.ok += 1
    if ((idx + 1) % 10 === 0 || idx === 0) {
      console.log(`[dna-pass] ${idx + 1}/${queue.length} ok=${stats.ok} fail=${stats.fail} last=${track.title}`)
    }
  } catch (error) {
    stats.fail += 1
    failures.push({ id: track.id, title: track.title, error: error.message.slice(0, 180) })
    console.warn(`[dna-pass] FAIL ${track.title}: ${error.message.slice(0, 180)}`)
  }
})

const reportPath = path.join(repoRoot, 'knowledge/library-analysis/agent-pass-report.json')
fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), stats, failures }, null, 2)}\n`)
console.log('[dna-pass] done', stats)

if (stats.ok > 0) {
  console.log('[dna-pass] recompiling dataset')
  const compiled = spawnSync(process.execPath, [path.join(__dirname, 'compile_library_analysis.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (compiled.status !== 0) process.exit(compiled.status || 1)
}
