#!/usr/bin/env node
/**
 * Apply Release Collab extended migration (inbound + contract kinds).
 * Usage: node scripts/apply-release-collab-extended-migration.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const url = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL
const sqlFile = path.join(webRoot, 'supabase/migrations/add_release_collab_extended.sql')

if (!url) {
  console.error('Set POSTGRES_URL or POSTGRES_URL_NON_POOLING in web/.env.local')
  process.exit(1)
}

const sql = readFileSync(sqlFile, 'utf8')
const { default: pg } = await import('pg')
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(sql)
  console.log('Applied add_release_collab_extended.sql')
} finally {
  await client.end()
}
