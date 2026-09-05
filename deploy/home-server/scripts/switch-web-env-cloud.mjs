#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  activateCloudProfile,
  cloudBackupPath,
  getCloudProfile,
  readWebEnv,
  webEnvPath,
} from '../../supabase-foundation/lib/env-profiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function reachable(url) {
  if (!url) return false
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
      signal: AbortSignal.timeout(5000),
    })
    return res.status !== 404 && res.status < 500
  } catch {
    return false
  }
}

let env = readWebEnv()
let cloud = getCloudProfile(env)

if (!cloud.url && fs.existsSync(cloudBackupPath)) {
  console.log('[env:cloud] Migrating legacy .env.local.cloud.bak → SERGIK_CLOUD_* profile…')
  const bak = fs.readFileSync(cloudBackupPath, 'utf8')
  for (const line of bak.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    let value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') env.SERGIK_CLOUD_SUPABASE_URL = value
    if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') env.SERGIK_CLOUD_SUPABASE_ANON_KEY = value
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') env.SERGIK_CLOUD_SERVICE_ROLE_KEY = value
  }
  cloud = getCloudProfile(env)
}

if (!cloud.url || !cloud.anon || !cloud.service) {
  console.error('[env:cloud] Cloud profile missing or incomplete.')
  console.error('[env:cloud] Run: cd web && npm run db:init-cloud-profile')
  process.exit(1)
}

if (!(await reachable(cloud.url))) {
  console.error(`[env:cloud] Cloud host unreachable: ${cloud.url}`)
  console.error('[env:cloud] Create a new Supabase project and run: npm run db:init-cloud-profile')
  process.exit(1)
}

activateCloudProfile(env)
fs.copyFileSync(webEnvPath, cloudBackupPath)
console.log(`[env:cloud] Active target: cloud (${cloud.url})`)
console.log('[env:cloud] Restart dev: cd web && npm run dev:restart')
