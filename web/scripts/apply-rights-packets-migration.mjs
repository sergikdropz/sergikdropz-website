#!/usr/bin/env node
/**
 * Apply release_copyright_checklists.rights_packets column (one-time).
 * Uses POSTGRES_URL_NON_POOLING or POSTGRES_URL from web/.env.local.
 *
 * Usage: node scripts/apply-rights-packets-migration.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')

function loadEnv() {
  const envPath = path.join(webRoot, '.env.local')
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    env[t.slice(0, i).trim()] = v
  }
  return env
}

const env = loadEnv()
let url = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL
const sqlFile = path.join(
  webRoot,
  'supabase/migrations/add_rights_packets_to_copyright_checklists.sql',
)

if (!url) {
  console.error('[rights-packets] Set POSTGRES_URL_NON_POOLING in web/.env.local')
  process.exit(1)
}
if (!existsSync(sqlFile)) {
  console.error('[rights-packets] Missing', sqlFile)
  process.exit(1)
}

const sql = readFileSync(sqlFile, 'utf8')
const sep = url.includes('?') ? '&' : '?'
url = `${url}${sep}uselibpqcompat=true&sslmode=require`

async function loadPg() {
  const candidates = [
    path.join('/tmp/sergik-pg-migrate/node_modules/pg/esm/index.mjs'),
    path.join('/tmp/sergik-pg-migrate/node_modules/pg/lib/index.js'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      return import(pathToFileURL(c).href)
    }
  }
  try {
    return await import('pg')
  } catch {
    const require = createRequire(path.join(webRoot, 'package.json'))
    try {
      return import(pathToFileURL(require.resolve('pg')).href)
    } catch {
      throw new Error(
        'pg not found — run: mkdir -p /tmp/sergik-pg-migrate && cd /tmp/sergik-pg-migrate && npm i pg@8.16.3',
      )
    }
  }
}

async function applyWithPg() {
  const pg = await loadPg()
  const { Client } = pg.default ?? pg
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 20000,
  })
  await client.connect()
  try {
    await client.query(sql)
    const check = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'release_copyright_checklists'
        AND column_name = 'rights_packets'
    `)
    if (!check.rows.length) throw new Error('Column still missing after ALTER')
    console.log(
      '[rights-packets] OK —',
      check.rows[0].column_name,
      `(${check.rows[0].data_type})`,
    )
  } finally {
    await client.end()
  }
}

console.log('[rights-packets] Applying release_copyright_checklists.rights_packets…')
try {
  await applyWithPg()
  console.log('[rights-packets] Done.')
} catch (err) {
  console.error('[rights-packets] Failed:', err instanceof Error ? err.message : err)
  console.error(
    '[rights-packets] Or paste supabase/migrations/add_rights_packets_to_copyright_checklists.sql in Supabase SQL Editor',
  )
  process.exit(1)
}
