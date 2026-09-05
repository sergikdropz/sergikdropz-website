#!/usr/bin/env node
/**
 * Upsert public-table rows between cloud Supabase and home-server PostgREST.
 * Default: --dry-run. Never deletes rows unless --allow-deletes (not implemented).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCloudProfile, getHomeProfile, readWebEnv } from './lib/env-profiles.mjs'
import { createSupabaseClient } from './lib/supabase-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, 'sync-tables.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

const args = process.argv.slice(2)
const dryRun = !args.includes('--apply')
const directionArg = args.find((a) => a.startsWith('--direction='))
const direction = directionArg?.split('=')[1] || 'both'
const tableArg = args.find((a) => a.startsWith('--table='))
const tables = tableArg ? [tableArg.split('=')[1]] : config.tables
const pageSize = config.pageSize || 500
const batchSize = config.batchSize || 100

const env = readWebEnv()
const cloud = getCloudProfile(env)
const home = getHomeProfile(env)

function client(profile, label) {
  if (!profile.url || !profile.service) {
    throw new Error(`${label} profile incomplete (URL + service role key required)`)
  }
  return createSupabaseClient(profile.url, profile.service)
}

async function fetchAll(supabase, table) {
  const rows = []
  let from = 0
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase.from(table).select('*').range(from, to)
    if (error) throw new Error(`${table} fetch: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function rowTimestamp(row) {
  const v = row?.updated_at || row?.created_at
  return v ? Date.parse(String(v)) || 0 : 0
}

function mergeRows(sourceRows, destRows) {
  const destById = new Map(destRows.map((r) => [r.id, r]))
  const toUpsert = []
  let skipped = 0
  for (const src of sourceRows) {
    if (!src?.id) continue
    const dest = destById.get(src.id)
    if (!dest) {
      toUpsert.push(src)
      continue
    }
    if (rowTimestamp(src) >= rowTimestamp(dest)) toUpsert.push(src)
    else skipped++
  }
  return { toUpsert, skipped }
}

async function upsertBatches(supabase, table, rows) {
  let upserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    upserted += batch.length
  }
  return upserted
}

async function syncOne(srcClient, dstClient, srcLabel, dstLabel, table) {
  console.log(`\n[sync] ${table}: ${srcLabel} → ${dstLabel}`)
  const [sourceRows, destRows] = await Promise.all([
    fetchAll(srcClient, table),
    fetchAll(dstClient, table),
  ])
  const { toUpsert, skipped } = mergeRows(sourceRows, destRows)
  console.log(`  source=${sourceRows.length} dest=${destRows.length} upsert=${toUpsert.length} skip=${skipped}`)
  if (dryRun) return { upserted: 0, wouldUpsert: toUpsert.length }
  const upserted = await upsertBatches(dstClient, table, toUpsert)
  return { upserted, wouldUpsert: toUpsert.length }
}

async function main() {
  console.log(`[sync-pair] direction=${direction} dryRun=${dryRun}`)
  const cloudClient = client(cloud, 'cloud')
  const homeClient = client(home, 'home')

  const pairs = []
  if (direction === 'cloud-to-home' || direction === 'both') {
    pairs.push({ src: cloudClient, dst: homeClient, srcLabel: 'cloud', dstLabel: 'home' })
  }
  if (direction === 'home-to-cloud' || direction === 'both') {
    pairs.push({ src: homeClient, dst: cloudClient, srcLabel: 'home', dstLabel: 'cloud' })
  }

  let total = 0
  for (const pair of pairs) {
    for (const table of tables) {
      try {
        const result = await syncOne(pair.src, pair.dst, pair.srcLabel, pair.dstLabel, table)
        total += dryRun ? result.wouldUpsert : result.upserted
      } catch (err) {
        console.error(`  ERROR: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  if (dryRun) {
    console.log(`\n[sync-pair] Dry run complete. Re-run with --apply to write ${total} row(s).`)
  } else {
    console.log(`\n[sync-pair] Applied ${total} upsert(s).`)
  }
}

main().catch((err) => {
  console.error('[sync-pair] Failed:', err.message || err)
  process.exit(1)
})
