#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'restore-data.json'), 'utf8'))

const esc = (s) => s == null ? null : String(s).replace(/'/g, "''")
const sqlVal = (v) => v == null ? 'NULL' : `'${esc(v)}'`
const sqlJson = (v) => v == null ? 'NULL' : `'${esc(JSON.stringify(v))}'::jsonb`
const sqlNum = (v) => v == null ? 'NULL' : String(v)

const BATCH_SIZE = 30
const batches = []
for (let i = 0; i < data.tracks.length; i += BATCH_SIZE) {
  batches.push(data.tracks.slice(i, i + BATCH_SIZE))
}

const sqls = batches.map((batch, idx) => {
  const cols = 'id, folder_id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, sonic_dna, waveform, display_order, metadata'
  const vals = batch.map(t => {
    return `(${sqlVal(t.id)}, ${sqlVal(t.folder_id)}, ${sqlVal(t.title)}, ${sqlVal(t.artist)}, ${sqlNum(t.duration)}, ${sqlVal(t.file_url)}, ${sqlVal(t.artwork_url)}, ${sqlNum(t.bpm)}, ${sqlVal(t.key_signature)}, ${sqlNum(t.energy_level)}, ${sqlNum(t.danceability)}, ${sqlJson(t.sonic_dna)}, ${sqlJson(t.waveform)}, 0, '{}'::jsonb)`
  }).join(',\n')
  return `INSERT INTO music_library_tracks (${cols}) VALUES\n${vals}\nON CONFLICT (id) DO NOTHING;`
})

sqls.forEach((sql, i) => {
  writeFileSync(join('/tmp', `tracks-batch-${i}.sql`), sql)
})
console.log(`Generated ${sqls.length} batch files in /tmp/tracks-batch-*.sql`)
console.log(`Total tracks: ${data.tracks.length}`)
