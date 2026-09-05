#!/usr/bin/env node
import { getCloudProfile, getHomeProfile, migrateLegacyProfiles, readWebEnv } from './lib/env-profiles.mjs'

migrateLegacyProfiles()

async function pingRest(url, label) {
  if (!url) return { label, ok: false, error: 'URL not configured' }
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404 || res.status >= 500) {
      return { label, ok: false, error: `HTTP ${res.status}` }
    }
    return { label, ok: true, host: new URL(url).host }
  } catch (err) {
    return { label, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function countTable(url, serviceKey, table) {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${table}?select=id`
  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 404 || body.includes('does not exist')) {
      return { table, count: null, missing: true }
    }
    throw new Error(`${table}: HTTP ${res.status} ${body.slice(0, 120)}`)
  }
  const range = res.headers.get('content-range') || ''
  const m = range.match(/\/(\d+|\*)/)
  const count = m && m[1] !== '*' ? Number(m[1]) : null
  return { table, count, missing: false }
}

const env = readWebEnv()
const cloud = getCloudProfile(env)
const home = getHomeProfile(env)

console.log('[db:verify] SERGIK database profiles\n')

const cloudPing = await pingRest(cloud.url, 'cloud')
const homePing = await pingRest(home.url, 'home')

console.log(`Cloud: ${cloud.url || '(not set)'}`)
console.log(`  reachability: ${cloudPing.ok ? 'OK' : `FAIL — ${cloudPing.error}`}`)
console.log(`Home:  ${home.url || '(not set)'}`)
console.log(`  reachability: ${homePing.ok ? 'OK' : `FAIL — ${homePing.error}`}`)
console.log(`Active target (SERGIK_DB_TARGET): ${env.SERGIK_DB_TARGET || 'unknown'}\n`)

if (cloudPing.ok && cloud.service) {
  try {
    const row = await countTable(cloud.url, cloud.service, 'audio_files')
    if (row.missing) console.log('Cloud audio_files: table missing — run db:schema-bundle then paste SQL in Supabase')
    else console.log(`Cloud audio_files: ${row.count ?? '?'} rows`)
  } catch (err) {
    console.log(`Cloud audio_files: error — ${err instanceof Error ? err.message : err}`)
  }
}

if (homePing.ok && home.service) {
  try {
    const row = await countTable(home.url, home.service, 'audio_files')
    if (row.missing) console.log('Home audio_files: table missing — start Docker home-server')
    else console.log(`Home audio_files: ${row.count ?? '?'} rows`)
  } catch (err) {
    console.log(`Home audio_files: error — ${err instanceof Error ? err.message : err}`)
  }
}

if (!cloudPing.ok && !homePing.ok) {
  console.log('\nNext: create a new Supabase project → npm run db:init-cloud-profile')
  process.exit(1)
}

if (!cloudPing.ok && homePing.ok) {
  console.log('\nCloud unreachable; home-server backup is OK for local dev (npm run env:home-server).')
  console.log('When you have a new Supabase project: npm run db:init-cloud-profile')
  process.exit(0)
}
