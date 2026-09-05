#!/usr/bin/env node
/**
 * Safe first-time cloud bootstrap (see bootstrap-cloud.mjs).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCloudProfile, getHomeProfile, readWebEnv } from './lib/env-profiles.mjs'
import { createSupabaseClient } from './lib/supabase-client.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const allowExisting = args.includes('--allow-existing')
const skipSync = args.includes('--skip-sync')

const cloud = getCloudProfile()
const home = getHomeProfile()

if (!cloud.url || !cloud.service) {
  console.error('[bootstrap] Cloud profile missing. Run: npm run db:init-cloud-profile')
  process.exit(1)
}

const cloudClient = createSupabaseClient(cloud.url, cloud.service)

async function count(table) {
  const { count, error } = await cloudClient.from(table).select('id', { count: 'exact', head: true })
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') return null
    throw error
  }
  return count ?? 0
}

console.log('[bootstrap] Checking cloud project…')
const audioCount = await count('audio_files')
if (audioCount === null) {
  console.error('[bootstrap] Table audio_files missing on cloud.')
  console.error('[bootstrap] 1. npm run db:schema-bundle')
  console.error('[bootstrap] 2. Paste deploy/supabase-foundation/out/schema-bundle.sql in Supabase SQL Editor')
  console.error('[bootstrap] 3. Re-run: npm run db:bootstrap-cloud')
  process.exit(1)
}

if (audioCount > 0 && !allowExisting) {
  console.error(`[bootstrap] Cloud already has ${audioCount} audio_files rows.`)
  console.error('[bootstrap] Refusing to overwrite. Use --allow-existing to upsert-merge from home/JSON anyway.')
  process.exit(1)
}

console.log(`[bootstrap] Cloud audio_files: ${audioCount} rows (OK to proceed)`)

if (!skipSync) {
  let homeUp = false
  try {
    const res = await fetch(`${home.url.replace(/\/+$/, '')}/rest/v1/`, {
      signal: AbortSignal.timeout(3000),
    })
    homeUp = res.status !== 404 && res.status < 500
  } catch {
    homeUp = false
  }

  const syncScript = path.join(__dirname, 'sync-pair.mjs')
  const webRoot = path.resolve(__dirname, '../../web')

  if (homeUp && home.service) {
    console.log('[bootstrap] Home-server reachable — syncing home → cloud…')
    for (const extra of [[], ['--apply']]) {
      const r = spawnSync(
        process.execPath,
        [syncScript, '--direction=home-to-cloud', ...extra],
        { stdio: 'inherit', cwd: __dirname },
      )
      if (r.status !== 0) process.exit(r.status || 1)
    }
  } else {
    console.log('[bootstrap] Home-server offline — importing JSON exports (upsert only)…')
    const imp = spawnSync(process.execPath, ['scripts/import-local-to-supabase.mjs'], {
      stdio: 'inherit',
      cwd: webRoot,
    })
    if (imp.status !== 0) {
      console.error('[bootstrap] JSON import failed. Start Docker home-server and re-run.')
      process.exit(imp.status || 1)
    }
  }
}

console.log('[bootstrap] Writing backup snapshot…')
const backup = spawnSync(process.execPath, [path.join(__dirname, 'backup-snapshot.mjs')], {
  stdio: 'inherit',
})

const env = readWebEnv()
console.log('\n[bootstrap] Complete.')
console.log('[bootstrap] Active profile:', env.SERGIK_DB_TARGET || 'cloud')
console.log('[bootstrap] cd web && npm run env:cloud && npm run dev:restart')
