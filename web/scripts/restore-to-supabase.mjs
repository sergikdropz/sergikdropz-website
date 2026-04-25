#!/usr/bin/env node

/**
 * Restore deduplicated data to Supabase via REST API.
 * Reads restore-data.json and inserts tracks in batches.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'restore-data.json'), 'utf8'))

const SUPABASE_URL = 'https://utgwlgcejflqxyalnlze.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it in env.')
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/restore-to-supabase.mjs')
  process.exit(1)
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=ignore-duplicates',
}

async function upsertBatch(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${table} insert failed (${res.status}): ${text}`)
  }
  return res.status
}

async function main() {
  console.log(`Inserting ${data.tracks.length} tracks into ${data.folders.length} folders...`)

  const BATCH_SIZE = 50
  let inserted = 0

  for (let i = 0; i < data.tracks.length; i += BATCH_SIZE) {
    const batch = data.tracks.slice(i, i + BATCH_SIZE)
    const rows = batch.map(t => ({
      id: t.id,
      folder_id: t.folder_id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      file_url: t.file_url,
      artwork_url: t.artwork_url,
      bpm: t.bpm,
      key_signature: t.key_signature,
      energy_level: t.energy_level,
      danceability: t.danceability,
      sonic_dna: t.sonic_dna,
      waveform: t.waveform,
      display_order: 0,
      metadata: {},
    }))

    try {
      await upsertBatch('music_library_tracks', rows)
      inserted += rows.length
      console.log(`  Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${rows.length} tracks (${inserted}/${data.tracks.length})`)
    } catch (err) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message)
    }
  }

  console.log(`\nDone! Inserted ${inserted}/${data.tracks.length} tracks.`)
}

main().catch(console.error)
