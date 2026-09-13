#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { activateHomeProfile, snapshotActiveProfile, readWebEnv } from '../../supabase-foundation/lib/env-profiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const homeEnvPath = path.join(__dirname, '../.env')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

const home = loadEnv(homeEnvPath)
if (!home.ANON_KEY || !home.SERVICE_ROLE_KEY) {
  console.error('[switch-web-env] Run: node deploy/home-server/scripts/generate-keys.mjs')
  process.exit(1)
}

snapshotActiveProfile(readWebEnv())
activateHomeProfile({
  API_EXTERNAL_URL: home.API_EXTERNAL_URL || 'http://127.0.0.1:8000',
  ANON_KEY: home.ANON_KEY,
  SERVICE_ROLE_KEY: home.SERVICE_ROLE_KEY,
})

console.log(`[switch-web-env] Active target: home (${home.API_EXTERNAL_URL || 'http://127.0.0.1:8000'})`)
console.log('[switch-web-env] Cloud keys preserved in SERGIK_CLOUD_* — restart: cd web && npm run dev:restart')
