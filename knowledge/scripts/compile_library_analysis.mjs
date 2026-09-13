#!/usr/bin/env node
/**
 * Compile Sonic DNA + waveforms + metadata into:
 *   - one analysis file per audio file
 *   - a library-wide dataset + indexes
 *
 * Prefers live home-server Postgres; falls back to web/data/supabase-export/audio_files.json.
 *
 * Usage:
 *   node knowledge/scripts/compile_library_analysis.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { applyMeasuredToDna } from './lib/sonic-dna-quality.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const homeRoot = path.join(repoRoot, 'deploy/home-server')
const webRoot = path.join(repoRoot, 'web')
const outRoot = path.join(repoRoot, 'knowledge/library-analysis')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

function pending(value) {
  if (value == null) return true
  if (typeof value === 'string') {
    const s = value.trim()
    return !s || s === 'Unknown' || s === 'Analysis pending' || s === 'SERGIK'
  }
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function pick(...values) {
  for (const value of values) {
    if (!pending(value)) return value
  }
  return values.find((v) => v != null) ?? null
}

function longerText(...values) {
  const texts = values.filter((v) => typeof v === 'string' && v.trim())
  if (!texts.length) return null
  texts.sort((a, b) => b.length - a.length)
  return pending(texts[0]) && texts[1] ? texts[1] : texts[0]
}

function mergeSection(primary = {}, secondary = {}) {
  const keys = new Set([...Object.keys(primary || {}), ...Object.keys(secondary || {})])
  const out = {}
  for (const key of keys) {
    const a = primary?.[key]
    const b = secondary?.[key]
    if (Array.isArray(a) || Array.isArray(b)) {
      out[key] = !pending(a) ? a : b || []
    } else if (a && typeof a === 'object' && b && typeof b === 'object' && !Array.isArray(a)) {
      out[key] = mergeSection(a, b)
    } else {
      out[key] = pick(a, b)
    }
  }
  return out
}

function normalizeGenre(name) {
  if (!name) return 'Unclassified'
  const raw = String(name).trim()
  const key = raw.toLowerCase()
  const aliases = {
    techno: 'Techno',
    house: 'House',
    electronica: 'Electronica',
    electronic: 'Electronic',
    ambient: 'Ambient',
    downtempo: 'Downtempo',
    'ambient techno': 'Ambient Techno',
    'ambient house': 'Ambient House',
    'dub techno': 'Dub Techno',
    'lo-fi hip-hop': 'Lo-Fi Hip-Hop',
    'dub reggae': 'Dub Reggae',
    'world fusion': 'World Fusion',
    trap: 'Trap',
  }
  if (aliases[key]) return aliases[key]
  return raw
}

function genreFromPath(folderPath, filePath) {
  const p = String(folderPath || filePath || '').replace(/\\/g, '/')
  const parts = p.split('/').filter(Boolean)
  const playlistsIdx = parts.findIndex((part) => part.toLowerCase() === 'playlists')
  if (playlistsIdx >= 0 && parts[playlistsIdx + 1]) return parts[playlistsIdx + 1]
  const epsIdx = parts.findIndex((part) => part.toLowerCase() === 'eps')
  if (epsIdx >= 0 && parts[epsIdx + 1]) return String(parts[epsIdx + 1]).replace(/^SERGIK\s*-\s*/i, '')
  return null
}

function bpmZone(bpm) {
  const n = Number(bpm)
  if (!Number.isFinite(n) || n <= 0) return 'unknown'
  if (n < 90) return 'downtempo'
  if (n < 118) return 'funk_fusion'
  if (n <= 128) return 'house'
  if (n <= 135) return 'tech_house'
  return 'cross_zone'
}

function slugify(title, id) {
  const slug = String(title || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return `${slug || 'track'}--${String(id).slice(0, 8)}`
}

function waveformStats(peaks) {
  if (!Array.isArray(peaks) || peaks.length === 0) {
    return { samples: 0, peak: 0, rms: 0, mean: 0, crest: 0, preview256: [] }
  }
  const abs = peaks.map((v) => Math.abs(Number(v) || 0))
  const n = abs.length
  let peak = 0
  let sum = 0
  let sumSq = 0
  for (const v of abs) {
    if (v > peak) peak = v
    sum += v
    sumSq += v * v
  }
  const mean = sum / n
  const rms = Math.sqrt(sumSq / n)
  const bins = 256
  const preview256 = []
  for (let i = 0; i < bins; i += 1) {
    const start = Math.floor((i * n) / bins)
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / bins))
    let m = 0
    for (let j = start; j < end && j < n; j += 1) {
      if (abs[j] > m) m = abs[j]
    }
    preview256.push(Number(m.toFixed(5)))
  }
  return {
    samples: n,
    peak: Number(peak.toFixed(6)),
    rms: Number(rms.toFixed(6)),
    mean: Number(mean.toFixed(6)),
    crest: Number((peak / (rms || 1)).toFixed(4)),
    preview256,
  }
}

function normalizeDanceability(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n > 1 ? Number((n / 10).toFixed(3)) : Number(n.toFixed(3))
}

function psqlJsonl(sql) {
  const env = loadEnv(path.join(homeRoot, '.env'))
  const dbName = env.POSTGRES_DB || 'sergik'
  const dbUser = env.POSTGRES_USER || 'postgres'
  const result = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', dbUser, '-d', dbName, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { cwd: homeRoot, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql failed')
  }
  return (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function loadAudioFromExport() {
  const file = path.join(webRoot, 'data/supabase-export/audio_files.json')
  if (!fs.existsSync(file)) return []
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(rows) ? rows : []
}

function loadLibraryFromJson() {
  const file = path.join(webRoot, 'data/music-library.json')
  if (!fs.existsSync(file)) return { tracks: [], playlists: [] }
  const lib = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tracks = []
  const walk = (nodes) => {
    for (const item of nodes || []) {
      for (const track of item.tracks || []) {
        tracks.push({
          id: track.id,
          title: track.title,
          artist: track.artist,
          folder_id: item.id,
          folder_name: item.name,
          folder_type: item.type,
          file_url: track.file || track.file_url,
          artwork_url: track.artwork || track.artwork_url,
          bpm: track.bpm,
          duration: track.duration,
          genre: track.genre,
          year: track.year,
          track_number: track.track_number,
        })
      }
      if (item.children) walk(item.children)
    }
  }
  walk(lib.folders || [])
  return { tracks, playlists: lib.playlists || [] }
}

function fileStem(url) {
  if (!url) return ''
  let s = String(url).split('?')[0]
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep */
  }
  s = s.replace(/\\/g, '/')
  return (s.split('/').pop() || '')
    .toLowerCase()
    .replace(/\.(mp3|wav|aiff|flac|m4a)$/i, '')
}

console.log('[compile] dumping analysis source')
let audioRows = []
let libraryTracks = []
let playlists = []
let source = 'home-server'

try {
  audioRows = psqlJsonl(`
    SELECT row_to_json(x) FROM (
      SELECT id::text, title, artist, file_name, file_path, file_url, format,
             duration_seconds, folder_path, artwork_url, metadata,
             waveform_data, waveform_samples, waveform_version,
             bpm, original_bpm, key_signature, energy_level, danceability,
             frequency_bands, sonic_dna, ai_analysis,
             sonic_dna_status, sonic_dna_analyzed_at, analysis_status, analyzed_at
      FROM audio_files
    ) x;
  `)
  libraryTracks = psqlJsonl(`
    SELECT row_to_json(x) FROM (
      SELECT t.id, t.title, t.artist, t.folder_id, t.audio_file_id::text AS audio_file_id,
             t.file_url, t.artwork_url, t.bpm, t.key_signature, t.duration, t.genre, t.year,
             t.track_number, t.display_order, f.name AS folder_name, f.type AS folder_type
      FROM music_library_tracks t
      LEFT JOIN music_library_folders f ON f.id = t.folder_id
    ) x;
  `)
  playlists = psqlJsonl(`
    SELECT row_to_json(x) FROM (
      SELECT id, name, description, artwork_url, track_ids, is_archived
      FROM music_library_playlists
    ) x;
  `)
  console.log(`[compile] postgres audio=${audioRows.length} library=${libraryTracks.length} playlists=${playlists.length}`)
} catch (error) {
  console.warn('[compile] postgres dump failed, using JSON export:', error.message)
  source = 'json-export'
  audioRows = loadAudioFromExport()
  const jsonLib = loadLibraryFromJson()
  libraryTracks = jsonLib.tracks
  playlists = jsonLib.playlists.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    artwork_url: p.artwork || p.artwork_url,
    track_ids: p.trackIds || p.track_ids || [],
    is_archived: false,
  }))
}

const audioById = new Map(audioRows.map((row) => [String(row.id), row]))
const audioByStem = new Map()
for (const row of audioRows) {
  const stem = fileStem(row.file_path || row.file_name || row.file_url)
  if (stem && !audioByStem.has(stem)) audioByStem.set(stem, row)
}

const playlistByTrackId = new Map()
for (const playlist of playlists) {
  for (const trackId of playlist.track_ids || []) {
    const list = playlistByTrackId.get(trackId) || []
    list.push({ id: playlist.id, name: playlist.name })
    playlistByTrackId.set(trackId, list)
  }
}

const libraryByAudioId = new Map()
for (const track of libraryTracks) {
  let audioId = track.audio_file_id ? String(track.audio_file_id) : null
  if (!audioId) {
    const stem = fileStem(track.file_url)
    audioId = audioByStem.get(stem)?.id ? String(audioByStem.get(stem).id) : null
  }
  if (!audioId) continue
  const entry = libraryByAudioId.get(audioId) || { trackIds: [], folders: [], playlists: [] }
  entry.trackIds.push(track.id)
  if (track.folder_id) {
    entry.folders.push({
      id: track.folder_id,
      name: track.folder_name,
      type: track.folder_type,
    })
  }
  for (const playlist of playlistByTrackId.get(track.id) || []) {
    entry.playlists.push(playlist)
  }
  libraryByAudioId.set(audioId, entry)
}

const compiledAt = new Date().toISOString()
fs.rmSync(path.join(outRoot, 'tracks'), { recursive: true, force: true })
fs.mkdirSync(path.join(outRoot, 'tracks'), { recursive: true })
fs.mkdirSync(path.join(outRoot, 'indexes'), { recursive: true })
fs.mkdirSync(path.join(outRoot, 'schema'), { recursive: true })

const catalog = []
const byFolder = {}
const byPlaylist = {}
const byGenre = {}
const byZone = {}
const byArtist = {}
const measuredDir = path.join(outRoot, 'measured')

function loadMeasuredFile(id) {
  const file = path.join(measuredDir, `${id}.json`)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

for (const row of audioRows) {
  const id = String(row.id)
  const dna = row.sonic_dna || {}
  const ai = row.ai_analysis || {}
  const wf = waveformStats(row.waveform_data)
  const membership = libraryByAudioId.get(id) || { trackIds: [], folders: [], playlists: [] }
  const uniqueFolders = []
  const seenFolder = new Set()
  for (const folder of membership.folders) {
    if (seenFolder.has(folder.id)) continue
    seenFolder.add(folder.id)
    uniqueFolders.push(folder)
  }
  const uniquePlaylists = []
  const seenPl = new Set()
  for (const playlist of membership.playlists) {
    if (seenPl.has(playlist.id)) continue
    seenPl.add(playlist.id)
    uniquePlaylists.push(playlist)
  }

  const measured = loadMeasuredFile(id) || dna.measured || ai.measured || null
  const existingDna = {
    ...ai,
    ...dna,
    genres: mergeSection(dna.genres, ai.genres),
    musical: mergeSection(dna.musical, ai.musical),
    emotional: mergeSection(dna.emotional, ai.emotional),
    technical: mergeSection(dna.technical, ai.technical),
    regional: mergeSection(dna.regional, ai.regional),
    historical: mergeSection(dna.historical, ai.historical),
    drums: mergeSection(dna.drums, ai.drums),
    cultural: mergeSection(dna.cultural, ai.cultural),
    musicology: mergeSection(dna.musicology, ai.musicology),
    comprehensive: mergeSection(dna.comprehensive, ai.comprehensive),
  }
  const { dna: mergedDna, status: measuredStatus } = measured
    ? applyMeasuredToDna(existingDna, measured)
    : { dna: existingDna, status: row.sonic_dna_status || row.analysis_status || 'compiled' }
  const genres = mergedDna.genres || {}
  const primaryGenre = normalizeGenre(
    measured?.genre?.primary ||
      (Array.isArray(genres.primaryGenres) && genres.primaryGenres[0]) ||
      'Unclassified'
  )
  const analysisStatus = measured
    ? measuredStatus
    : row.sonic_dna_status || row.analysis_status || 'compiled'

  const analysis = {
    schemaVersion: '1.0',
    id,
    slug: slugify(row.title, id),
    inLibrary: membership.trackIds.length > 0,
    identity: {
      title: row.title,
      artist: row.artist || 'SERGIK',
      fileName: row.file_name,
      filePath: row.file_path,
      fileUrl: row.file_url,
      format: row.format,
      artworkUrl: row.artwork_url || null,
      folderPath: row.folder_path || null,
    },
    library: {
      trackIds: membership.trackIds,
      folders: uniqueFolders,
      playlists: uniquePlaylists,
    },
    metadata: {
      durationSeconds: row.duration_seconds ?? null,
      bpm: measured?.bpm ?? row.bpm ?? null,
      originalBpm: row.original_bpm ?? null,
      keySignature: pick(measured?.key, row.key_signature, dna.musical?.keySignature, ai.musical?.keySignature),
      energyLevel: row.energy_level ?? null,
      danceability: row.danceability ?? null,
      danceabilityNormalized: normalizeDanceability(row.danceability),
      bpmZone: bpmZone(measured?.bpm ?? row.bpm),
    },
    analysis: {
      compiledAt,
      status: analysisStatus,
      analyzedAt: row.sonic_dna_analyzed_at || row.analyzed_at || measured?.analyzedAt || null,
      sonicDna: {
        summary: longerText(mergedDna.summary, measured?.report?.description, dna.summary, ai.summary, `${row.artist || 'SERGIK'} — ${row.title}`),
        description: longerText(mergedDna.description, measured?.report?.description, dna.description, ai.description),
        intention: longerText(mergedDna.intention, dna.intention, ai.intention),
        measured,
        genres,
        musical: mergedDna.musical || {},
        emotional: mergedDna.emotional || {},
        technical: {
          ...(mergedDna.technical || {}),
          bpm: measured?.bpm ?? row.bpm ?? mergedDna.technical?.bpm ?? null,
          energyLevel: mergedDna.technical?.energyLevel ?? row.energy_level ?? null,
          danceability: mergedDna.technical?.danceability ?? row.danceability ?? null,
          frequencyBands: row.frequency_bands || mergedDna.technical?.frequencyBands || null,
        },
        regional: mergedDna.regional || {},
        historical: mergedDna.historical || {},
        cultural: mergedDna.cultural || {},
        musicology: mergedDna.musicology || {},
        comprehensive: mergedDna.comprehensive || {},
        drums: mergedDna.drums || {},
        percussion: mergedDna.percussion || measured?.percussion || null,
        instruments: mergedDna.instruments || null,
        harmony: mergedDna.harmony || null,
        _metadata: mergedDna._metadata || dna._metadata || ai._metadata || null,
      },
      frequencyBands: row.frequency_bands || null,
      waveform: {
        samples: row.waveform_samples || wf.samples,
        version: row.waveform_version || 1,
        stats: {
          peak: wf.peak,
          rms: wf.rms,
          mean: wf.mean,
          crest: wf.crest,
        },
        preview256: wf.preview256,
        peaks: Array.isArray(row.waveform_data) ? row.waveform_data : [],
      },
    },
  }

  const fileName = `${analysis.slug}.json`
  fs.writeFileSync(path.join(outRoot, 'tracks', fileName), `${JSON.stringify(analysis)}\n`)

  const compact = {
    id,
    slug: analysis.slug,
    file: `tracks/${fileName}`,
    title: row.title,
    artist: analysis.identity.artist,
    inLibrary: analysis.inLibrary,
    bpm: analysis.metadata.bpm,
    bpmZone: analysis.metadata.bpmZone,
    keySignature: analysis.metadata.keySignature,
    energyLevel: analysis.metadata.energyLevel,
    danceabilityNormalized: analysis.metadata.danceabilityNormalized,
    durationSeconds: analysis.metadata.durationSeconds,
    primaryGenre,
    drumFamily: measured?.drumFamily || null,
    hatGrid: measured?.percussion?.hatGrid || null,
    relatedGenres: (measured?.intelligence?.relatedGenres || mergedDna.genres?.relatedGenres || []).slice(0, 8),
    hasIntelligence: Boolean(measured?.intelligence?.description),
    analysisStatus,
    instruments: (measured?.instruments || []).filter((item) => item.confidence >= 0.4).map((item) => item.id),
    summary: analysis.analysis.sonicDna.summary,
    waveform: {
      samples: analysis.analysis.waveform.samples,
      ...analysis.analysis.waveform.stats,
    },
    folders: uniqueFolders.map((f) => f.name),
    playlists: uniquePlaylists.map((p) => p.name),
    libraryTrackIds: membership.trackIds,
  }
  catalog.push(compact)

  for (const folder of uniqueFolders) {
    ;(byFolder[folder.name] ||= []).push(compact.slug)
  }
  for (const playlist of uniquePlaylists) {
    ;(byPlaylist[playlist.name] ||= []).push(compact.slug)
  }
  ;(byGenre[primaryGenre] ||= []).push(compact.slug)
  ;(byZone[analysis.metadata.bpmZone] ||= []).push(compact.slug)
  ;(byArtist[analysis.identity.artist] ||= []).push(compact.slug)
}

catalog.sort((a, b) => String(a.title).localeCompare(String(b.title)))

const dataset = {
  schemaVersion: '1.0',
  generatedAt: compiledAt,
  source,
  description:
    'Compiled SERGIK library analysis. One analysis file per audio recording; the same file can belong to multiple folders/playlists.',
  counts: {
    audioFiles: audioRows.length,
    libraryTracks: libraryTracks.length,
    uniqueLibraryAudio: catalog.filter((t) => t.inLibrary).length,
    catalogOnly: catalog.filter((t) => !t.inLibrary).length,
    withWaveform: catalog.filter((t) => t.waveform.samples > 0).length,
    withBpm: catalog.filter((t) => t.bpm).length,
  },
  bpm: {
    min: Math.min(...catalog.map((t) => t.bpm).filter(Boolean)),
    max: Math.max(...catalog.map((t) => t.bpm).filter(Boolean)),
    mean: Number(
      (
        catalog.filter((t) => t.bpm).reduce((s, t) => s + t.bpm, 0) /
        Math.max(1, catalog.filter((t) => t.bpm).length)
      ).toFixed(2),
    ),
  },
  folders: Object.fromEntries(Object.entries(byFolder).map(([k, v]) => [k, v.length])),
  playlists: Object.fromEntries(Object.entries(byPlaylist).map(([k, v]) => [k, v.length])),
  genres: Object.fromEntries(
    Object.entries(byGenre)
      .map(([k, v]) => [k, v.length])
      .sort((a, b) => b[1] - a[1]),
  ),
  bpmZones: Object.fromEntries(Object.entries(byZone).map(([k, v]) => [k, v.length])),
  tracks: catalog,
}

fs.copyFileSync(
  path.join(repoRoot, 'knowledge/schemas/track-analysis.v1.schema.json'),
  path.join(outRoot, 'schema/track-analysis.v1.schema.json'),
)
fs.writeFileSync(path.join(outRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'dataset.json'), `${JSON.stringify(dataset, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'indexes/by-folder.json'), `${JSON.stringify(byFolder, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'indexes/by-playlist.json'), `${JSON.stringify(byPlaylist, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'indexes/by-genre.json'), `${JSON.stringify(byGenre, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'indexes/by-bpm-zone.json'), `${JSON.stringify(byZone, null, 2)}\n`)
fs.writeFileSync(path.join(outRoot, 'indexes/by-artist.json'), `${JSON.stringify(byArtist, null, 2)}\n`)

const csvHeader = [
  'id',
  'slug',
  'title',
  'artist',
  'inLibrary',
  'bpm',
  'bpmZone',
  'keySignature',
  'energyLevel',
  'danceabilityNormalized',
  'durationSeconds',
  'primaryGenre',
  'folders',
  'playlists',
  'file',
]
const csvRows = catalog.map((t) =>
  [
    t.id,
    t.slug,
    `"${String(t.title).replaceAll('"', '""')}"`,
    `"${String(t.artist).replaceAll('"', '""')}"`,
    t.inLibrary,
    t.bpm ?? '',
    t.bpmZone,
    t.keySignature ?? '',
    t.energyLevel ?? '',
    t.danceabilityNormalized ?? '',
    t.durationSeconds ?? '',
    `"${String(t.primaryGenre).replaceAll('"', '""')}"`,
    `"${(t.folders || []).join('|')}"`,
    `"${(t.playlists || []).join('|')}"`,
    t.file,
  ].join(','),
)
fs.writeFileSync(path.join(outRoot, 'catalog.csv'), `${csvHeader.join(',')}\n${csvRows.join('\n')}\n`)

console.log('[compile] wrote', outRoot)
console.log(JSON.stringify(dataset.counts, null, 2))
console.log('[compile] genres', dataset.genres)
console.log('[compile] zones', dataset.bpmZones)
