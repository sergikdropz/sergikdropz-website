#!/usr/bin/env node
/**
 * Validate Printful env for local SERGWEAR dev.
 * Loads web/.env.local via dotenv if present (Next does this at runtime).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(webRoot, '.env.local')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const raw = readFileSync(filePath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(envPath)

const key = process.env.PRINTFUL_API_KEY?.trim()
const storeId = process.env.PRINTFUL_STORE_ID?.trim()

console.log('[printful:check] .env.local:', existsSync(envPath) ? envPath : 'missing')
console.log('[printful:check] PRINTFUL_API_KEY:', key ? `set (${key.length} chars)` : 'NOT SET')
console.log('[printful:check] PRINTFUL_STORE_ID:', storeId || 'NOT SET')

if (!key) {
  console.log('\nAdd credentials per web/docs/admin/PRINTFUL_API_SETUP.md then restart dev.')
  process.exit(1)
}

const res = await fetch('https://api.printful.com/stores', {
  headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
})
const body = await res.text()
if (!res.ok) {
  console.error('\n[printful:check] API rejected token:', res.status, body.slice(0, 200))
  process.exit(1)
}

const data = JSON.parse(body)
const stores = data.result || []
console.log('\n[printful:check] Stores on this token:')
for (const store of stores) {
  const mark = storeId && String(store.id) === storeId ? ' ← configured' : ''
  console.log(`  ${store.id}  ${store.name}  (${store.type || 'type?'})${mark}`)
}

if (!storeId) {
  console.log('\nCopy the Manual/API store id into PRINTFUL_STORE_ID in web/.env.local')
  process.exit(1)
}

const match = stores.some((s) => String(s.id) === storeId)
if (!match) {
  console.error('\n[printful:check] PRINTFUL_STORE_ID does not match any store above.')
  process.exit(1)
}

console.log('\n[printful:check] OK — ready for Put it out (restart dev if you just edited .env.local).')
