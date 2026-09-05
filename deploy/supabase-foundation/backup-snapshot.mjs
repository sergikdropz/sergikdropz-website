#!/usr/bin/env node
/**
 * Timestamped JSON exports from cloud + optional home-server pg_dump.
 * Never deletes prior snapshots.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCloudProfile, getHomeProfile } from './lib/env-profiles.mjs'
import { createSupabaseClient } from './lib/supabase-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const snapshotsRoot = path.join(__dirname, 'snapshots')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = path.join(snapshotsRoot, stamp)

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sync-tables.json'), 'utf8'),
)
const tables = config.tables

async function exportTable(client, table) {
  const rows = []
  let from = 0
  const pageSize = 500
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await client.from(table).select('*').range(from, to)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function exportProfile(label, profile) {
  if (!profile.url || !profile.service) {
    console.log(`[backup] skip ${label} — profile incomplete`)
    return null
  }
  const client = createSupabaseClient(profile.url, profile.service)
  const dir = path.join(outDir, label)
  fs.mkdirSync(dir, { recursive: true })
  const stats = {}
  for (const table of tables) {
    try {
      const rows = await exportTable(client, table)
      fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2))
      stats[table] = rows.length
      console.log(`[backup] ${label}/${table}: ${rows.length} rows`)
    } catch (err) {
      stats[table] = `error: ${err instanceof Error ? err.message : err}`
      console.log(`[backup] ${label}/${table}: skipped (${stats[table]})`)
    }
  }
  return stats
}

function tryHomePgDump() {
  const compose = path.resolve(__dirname, '../home-server')
  const dumpPath = path.join(outDir, 'home-sergik-public.dump.sql')
  const probe = spawnSync('docker', ['compose', 'ps', '-q', 'db'], {
    cwd: compose,
    encoding: 'utf8',
  })
  if (!probe.stdout?.trim()) return false
  const dump = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      'sergik',
      '--no-owner',
      '--no-acl',
      '--schema=public',
    ],
    { cwd: compose, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  )
  if (dump.status !== 0) return false
  fs.writeFileSync(dumpPath, dump.stdout)
  console.log(`[backup] home pg_dump: ${(fs.statSync(dumpPath).size / (1024 * 1024)).toFixed(1)} MB`)
  return true
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`[backup] Writing snapshot → ${outDir}`)

  const cloud = getCloudProfile()
  const home = getHomeProfile()
  const manifest = {
    createdAt: new Date().toISOString(),
    cloud: { url: cloud.url || null, tables: await exportProfile('cloud', cloud) },
    home: { url: home.url || null, tables: await exportProfile('home', home) },
    homePgDump: tryHomePgDump(),
  }

  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))
  console.log(`[backup] Done. Manifest: ${path.join(outDir, 'MANIFEST.json')}`)
}

main().catch((err) => {
  console.error('[backup] Failed:', err.message || err)
  process.exit(1)
})
