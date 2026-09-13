#!/usr/bin/env node
/**
 * Rebuild album/EP/genre playlists from music-library.json onto the home-server.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const homeRoot = path.join(__dirname, '..')
const webRoot = path.join(homeRoot, '../../web')
const libraryPath = path.join(webRoot, 'data/music-library.json')

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

const env = loadEnv(path.join(homeRoot, '.env'))
const api = (env.API_EXTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const serviceKey = env.SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error('[rebuild-playlists] Missing SERVICE_ROLE_KEY')
  process.exit(1)
}

function walkAlbums(nodes, acc) {
  for (const item of nodes || []) {
    const type = String(item.type || '').toLowerCase()
    if (['ep', 'album', 'single', 'remix'].includes(type) && Array.isArray(item.tracks) && item.tracks.length) {
      acc.push(item)
    }
    if (item.children) walkAlbums(item.children, acc)
  }
}

function toPlaylist(item) {
  const trackIds = item.tracks.map((t) => t.id).filter(Boolean)
  const kind = String(item.type || 'album')
  return {
    id: `playlist-${item.id}`,
    name: item.name,
    description:
      kind === 'ep'
        ? `${item.name} EP`
        : item.isCompilation || item.genre
          ? `${item.name} collection`
          : `${item.name} album`,
    artwork_url: item.artwork || item.artwork_url || item.tracks.find((t) => t.artwork)?.artwork || null,
    track_ids: trackIds,
    is_archived: false,
  }
}

const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
const albums = []
walkAlbums(library.folders || [], albums)
const playlists = albums.map(toPlaylist)

library.playlists = playlists.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  artwork: p.artwork_url || undefined,
  trackIds: p.track_ids,
  createdAt: new Date().toISOString(),
}))
fs.writeFileSync(libraryPath, `${JSON.stringify(library, null, 2)}\n`)
console.log(`[rebuild-playlists] wrote ${playlists.length} playlists to music-library.json`)

const url = `${api}/rest/v1/music_library_playlists?on_conflict=id`
const res = await fetch(url, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal,resolution=merge-duplicates',
  },
  body: JSON.stringify(playlists),
})
if (!res.ok) {
  const text = await res.text()
  throw new Error(`POST playlists ${res.status}: ${text.slice(0, 600)}`)
}

for (const p of playlists) {
  console.log(`  ${p.name} (${p.track_ids.length} tracks)`)
}
console.log(`[rebuild-playlists] seeded ${playlists.length} playlists`)
