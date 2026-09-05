#!/usr/bin/env node
/**
 * Seed the home-server Postgres via PostgREST using repo JSON exports.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const homeRoot = path.join(__dirname, '..')
const webRoot = path.join(homeRoot, '../../web')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

const env = loadEnv(path.join(homeRoot, '.env'))
const api = (env.API_EXTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const serviceKey = env.SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error('[seed] Missing SERVICE_ROLE_KEY. Run generate-keys.mjs first.')
  process.exit(1)
}

async function upsert(table, rows, onConflict = 'id') {
  if (!rows.length) return
  const chunkSize = 40
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const url = `${api}/rest/v1/${table}?on_conflict=${onConflict}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`POST ${table} ${res.status}: ${text.slice(0, 500)}`)
    }
    process.stdout.write('.')
  }
}

function pick(row, keys) {
  const out = {}
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key]
  }
  return out
}

const audioKeys = [
  'id', 'title', 'artist', 'file_name', 'file_path', 'file_url', 'format',
  'size_bytes', 'size_mb', 'duration_seconds', 'folder_path', 'is_purchasable',
  'price_usd', 'artwork_url', 'metadata', 'created_at', 'updated_at',
  'waveform_data', 'waveform_samples', 'waveform_version', 'analysis_status',
  'analysis_error', 'analyzed_at', 'bpm', 'original_bpm', 'key_signature',
  'energy_level', 'danceability', 'frequency_bands', 'sonic_dna',
  'musicbrainz_id', 'musicbrainz_data', 'ai_analysis', 'sonic_dna_status',
  'sonic_dna_analyzed_at', 'sonic_dna_error',
]

function walkLibrary(node, parentId, folders, tracks) {
  if (!node) return
  const nodes = Array.isArray(node) ? node : [node]
  for (const item of nodes) {
    if (!item?.id) continue
    folders.push({
      id: item.id,
      name: item.name || item.title || item.id,
      type: item.type || 'folder',
      parent_id: item.parentId ?? item.parent_id ?? parentId ?? null,
      year: item.year || null,
      artwork_url: item.artwork || item.artwork_url || null,
      hidden: false,
      is_archived: false,
      display_order: item.display_order || 0,
    })
    if (Array.isArray(item.tracks)) {
      item.tracks.forEach((track, index) => {
        if (!track?.id) return
        tracks.push({
          id: track.id,
          folder_id: item.id,
          title: track.title || 'Untitled',
          artist: track.artist || 'SERGIK',
          duration: track.duration || null,
          file_url: track.file || track.file_url || '',
          artwork_url: track.artwork || track.artwork_url || null,
          bpm: track.bpm || null,
          key_signature: track.key_signature || null,
          sonic_dna: track.sonic_dna || null,
          energy_level: track.energy_level || null,
          danceability: track.danceability || null,
          year: track.year || item.year || null,
          display_order: track.track_number || index,
          track_number: track.track_number || index + 1,
        })
      })
    }
    if (item.children) walkLibrary(item.children, item.id, folders, tracks)
  }
}

async function waitForApi() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${api}/rest/v1/`, { headers: { apikey: serviceKey } })
      if (res.status < 500) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Home API not reachable at ${api}`)
}

async function createAdmin() {
  const email = env.ADMIN_EMAIL || 'admin@sergik.com'
  const password = env.ADMIN_PASSWORD || 'SergikHome2026!'
  const res = await fetch(`${api}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !String(data?.msg || data?.message || '').toLowerCase().includes('already')) {
    console.warn('[seed] admin create:', res.status, data?.msg || data?.message || data)
    return
  }
  const userId = data?.id
  if (userId) {
    await upsert('admins', [{ user_id: userId, email, active: true }], 'user_id')
    console.log(`\n[seed] Admin user ${email}`)
  } else {
    console.log('\n[seed] Admin may already exist — login with ADMIN_EMAIL / ADMIN_PASSWORD from .env')
  }
}

const audioPath = path.join(webRoot, 'data/supabase-export/audio_files.json')
const galleryPath = path.join(webRoot, 'data/gallery.json')
const libraryPath = path.join(webRoot, 'data/music-library.json')

await waitForApi()
console.log(`[seed] Seeding ${api}`)

if (fs.existsSync(audioPath)) {
  const audio = JSON.parse(fs.readFileSync(audioPath, 'utf8'))
  const rows = (Array.isArray(audio) ? audio : []).map((row) => pick(row, audioKeys))
  console.log(`[seed] audio_files ${rows.length}`)
  await upsert('audio_files', rows)
  console.log(' ok')
}

if (fs.existsSync(galleryPath)) {
  const gallery = JSON.parse(fs.readFileSync(galleryPath, 'utf8'))
  const rows = (gallery.images || []).map((img, index) => ({
    image_id: img.id,
    filename: path.basename(img.src || `${img.id}.jpg`),
    src: img.src,
    alt: img.alt || img.id,
    category: img.category || 'portrait',
    description: img.description || null,
    is_stored_in_supabase: false,
    display_order: index,
    is_active: true,
  }))
  console.log(`[seed] gallery_images ${rows.length}`)
  await upsert('gallery_images', rows, 'image_id')
  console.log(' ok')
}

if (fs.existsSync(libraryPath)) {
  const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
  const folders = []
  const tracks = []
  walkLibrary(library.folders || [], null, folders, tracks)
  const seen = new Set()
  const uniqueFolders = folders.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
  const remaining = [...uniqueFolders]
  const ordered = []
  const inserted = new Set()
  while (remaining.length) {
    const ready = remaining.filter((f) => !f.parent_id || inserted.has(f.parent_id) || !uniqueFolders.some((x) => x.id === f.parent_id))
    if (!ready.length) {
      ordered.push(...remaining)
      break
    }
    for (const folder of ready) {
      ordered.push(folder)
      inserted.add(folder.id)
    }
    remaining.splice(0, remaining.length, ...remaining.filter((f) => !inserted.has(f.id)))
  }
  console.log(`[seed] music_library_folders ${ordered.length}`)
  await upsert('music_library_folders', ordered)
  console.log(' ok')
  const playable = tracks.filter((t) => t.file_url)
  console.log(`[seed] music_library_tracks ${playable.length}`)
  await upsert('music_library_tracks', playable)
  console.log(' ok')

  const albums = []
  function walkAlbums(nodes) {
    for (const item of nodes || []) {
      const type = String(item.type || '').toLowerCase()
      if (['ep', 'album', 'single', 'remix'].includes(type) && Array.isArray(item.tracks) && item.tracks.length) {
        albums.push(item)
      }
      if (item.children) walkAlbums(item.children)
    }
  }
  walkAlbums(library.folders || [])
  const playlists = albums.map((item) => ({
    id: `playlist-${item.id}`,
    name: item.name,
    description: item.type === 'ep' ? `${item.name} EP` : `${item.name} collection`,
    artwork_url: item.artwork || item.tracks.find((t) => t.artwork)?.artwork || null,
    track_ids: item.tracks.map((t) => t.id).filter(Boolean),
    is_archived: false,
  }))
  if (playlists.length) {
    console.log(`[seed] music_library_playlists ${playlists.length}`)
    await upsert('music_library_playlists', playlists)
    console.log(' ok')
  }
}

await createAdmin()

const restore = spawnSync(process.execPath, [path.join(__dirname, 'restore-analysis.mjs')], {
  cwd: homeRoot,
  stdio: 'inherit',
})
if (restore.status !== 0) {
  console.warn('[seed] restore-analysis failed; waveforms/sonic DNA may still be unlinked')
}
console.log('[seed] Done.')
