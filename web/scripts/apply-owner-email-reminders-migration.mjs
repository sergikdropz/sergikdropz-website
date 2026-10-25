#!/usr/bin/env node
/**
 * Apply owner_email_reminders (one-time).
 * Uses POSTGRES_URL_NON_POOLING or POSTGRES_URL from web/.env.local.
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
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[trimmed.slice(0, eq).trim()] = value
  }
  return env
}

const env = loadEnv()
let url = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL
const sqlFile = path.join(webRoot, 'supabase/migrations/add_owner_email_reminders.sql')

if (!url) {
  console.error('[owner-reminders] Set POSTGRES_URL_NON_POOLING in web/.env.local')
  process.exit(1)
}
if (!existsSync(sqlFile)) {
  console.error('[owner-reminders] Missing', sqlFile)
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
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
  }
  try {
    return await import('pg')
  } catch {
    const require = createRequire(path.join(webRoot, 'package.json'))
    return import(pathToFileURL(require.resolve('pg')).href)
  }
}

const pg = await loadPg()
const { Client } = pg.default ?? pg
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 })
await client.connect()
try {
  await client.query(sql)
  const check = await client.query(
    `SELECT to_regclass('public.owner_email_reminders') AS name`,
  )
  if (!check.rows[0]?.name) throw new Error('owner_email_reminders was not created')
  console.log('[owner-reminders] OK — owner_email_reminders')
} finally {
  await client.end()
}
