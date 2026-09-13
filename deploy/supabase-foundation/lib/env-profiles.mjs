#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const webEnvPath = path.resolve(__dirname, '../../../web/.env.local')
export const cloudBackupPath = `${webEnvPath}.cloud.bak`

export function parseEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function readWebEnv() {
  return parseEnvFile(webEnvPath)
}

export function writeWebEnv(vars) {
  const existing = readWebEnv()
  const merged = { ...existing, ...vars }
  const lines = []
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === '') continue
    lines.push(`${key}=${value}`)
  }
  fs.writeFileSync(webEnvPath, `${lines.join('\n')}\n`)
}

export function removeEnvKeys(keys) {
  if (!fs.existsSync(webEnvPath)) return
  let text = fs.readFileSync(webEnvPath, 'utf8')
  for (const key of keys) {
    text = text.replace(new RegExp(`^${key}=.*\\n?`, 'm'), '')
  }
  text = text.trim()
  fs.writeFileSync(webEnvPath, text ? `${text}\n` : '')
}

export function isCloudHost(url) {
  return typeof url === 'string' && /\.supabase\.co/i.test(url)
}

export function isHomeHost(url) {
  return typeof url === 'string' && /127\.0\.0\.1:8000|localhost:8000/.test(url)
}

/** Snapshot active Supabase keys into SERGIK_CLOUD_* or SERGIK_HOME_* before switching. */
export function snapshotActiveProfile(env = readWebEnv()) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return env
  const patch = {}
  if (isCloudHost(url)) {
    patch.SERGIK_CLOUD_SUPABASE_URL = url
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      patch.SERGIK_CLOUD_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }
    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      patch.SERGIK_CLOUD_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
    }
    patch.SERGIK_DB_TARGET = 'cloud'
  } else if (isHomeHost(url)) {
    patch.SERGIK_HOME_SUPABASE_URL = url
    if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      patch.SERGIK_HOME_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }
    if (env.SUPABASE_SERVICE_ROLE_KEY) {
      patch.SERGIK_HOME_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
    }
    patch.SERGIK_DB_TARGET = 'home'
  }
  return { ...env, ...patch }
}

export function getCloudProfile(env = readWebEnv()) {
  const url =
    env.SERGIK_CLOUD_SUPABASE_URL ||
    (isCloudHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_URL : '')
  const anon =
    env.SERGIK_CLOUD_SUPABASE_ANON_KEY ||
    (isCloudHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '')
  const service =
    env.SERGIK_CLOUD_SERVICE_ROLE_KEY ||
    (isCloudHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.SUPABASE_SERVICE_ROLE_KEY : '')
  return { url, anon, service }
}

export function getHomeProfile(env = readWebEnv()) {
  const url =
    env.SERGIK_HOME_SUPABASE_URL ||
    (isHomeHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_URL : 'http://127.0.0.1:8000')
  const anon =
    env.SERGIK_HOME_SUPABASE_ANON_KEY ||
    (isHomeHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '')
  const service =
    env.SERGIK_HOME_SERVICE_ROLE_KEY ||
    (isHomeHost(env.NEXT_PUBLIC_SUPABASE_URL) ? env.SUPABASE_SERVICE_ROLE_KEY : '')
  return { url, anon, service }
}

export function activateCloudProfile(env = readWebEnv()) {
  const snap = snapshotActiveProfile(env)
  const cloud = getCloudProfile(snap)
  if (!cloud.url || !cloud.anon || !cloud.service) {
    throw new Error('Cloud profile incomplete. Run: npm run db:init-cloud-profile')
  }
  const next = {
    ...snap,
    SERGIK_CLOUD_SUPABASE_URL: cloud.url,
    SERGIK_CLOUD_SUPABASE_ANON_KEY: cloud.anon,
    SERGIK_CLOUD_SERVICE_ROLE_KEY: cloud.service,
    SERGIK_DB_TARGET: 'cloud',
    NEXT_PUBLIC_SUPABASE_URL: cloud.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: cloud.anon,
    SUPABASE_SERVICE_ROLE_KEY: cloud.service,
  }
  writeWebEnv(next)
  removeEnvKeys(['NEXT_PUBLIC_LOCAL_AUDIO'])
  if (!fs.existsSync(cloudBackupPath)) {
    fs.copyFileSync(webEnvPath, cloudBackupPath)
  }
  return next
}

export function migrateLegacyProfiles() {
  const env = readWebEnv()
  let changed = false
  const next = { ...env }

  if (!next.SERGIK_CLOUD_SUPABASE_URL && fs.existsSync(cloudBackupPath)) {
    const bak = parseEnvFile(cloudBackupPath)
    if (bak.NEXT_PUBLIC_SUPABASE_URL) {
      next.SERGIK_CLOUD_SUPABASE_URL = bak.NEXT_PUBLIC_SUPABASE_URL.replace(/^["']|["']$/g, '')
      next.SERGIK_CLOUD_SUPABASE_ANON_KEY = bak.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/^["']|["']$/g, '')
      next.SERGIK_CLOUD_SERVICE_ROLE_KEY = bak.SUPABASE_SERVICE_ROLE_KEY?.replace(/^["']|["']$/g, '')
      changed = true
    }
  }

  const homeEnvPath = path.resolve(__dirname, '../../home-server/.env')
  if ((!next.SERGIK_HOME_SUPABASE_ANON_KEY || !next.SERGIK_HOME_SERVICE_ROLE_KEY) && fs.existsSync(homeEnvPath)) {
    const home = parseEnvFile(homeEnvPath)
    if (home.ANON_KEY && home.SERVICE_ROLE_KEY) {
      next.SERGIK_HOME_SUPABASE_URL = home.API_EXTERNAL_URL || 'http://127.0.0.1:8000'
      next.SERGIK_HOME_SUPABASE_ANON_KEY = home.ANON_KEY
      next.SERGIK_HOME_SERVICE_ROLE_KEY = home.SERVICE_ROLE_KEY
      changed = true
    }
  }

  if (changed) writeWebEnv(next)
  return changed
}

export function activateHomeProfile(homeKeys, env = readWebEnv()) {
  const snap = snapshotActiveProfile(env)
  const api = homeKeys.API_EXTERNAL_URL || homeKeys.url || 'http://127.0.0.1:8000'
  const anon = homeKeys.ANON_KEY || homeKeys.anon
  const service = homeKeys.SERVICE_ROLE_KEY || homeKeys.service
  if (!anon || !service) {
    throw new Error('Home-server keys missing. Run deploy/home-server/scripts/generate-keys.mjs')
  }
  const next = {
    ...snap,
    SERGIK_HOME_SUPABASE_URL: api,
    SERGIK_HOME_SUPABASE_ANON_KEY: anon,
    SERGIK_HOME_SERVICE_ROLE_KEY: service,
    SERGIK_DB_TARGET: 'home',
    NEXT_PUBLIC_SUPABASE_URL: api,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    NEXT_PUBLIC_LOCAL_AUDIO: '1',
  }
  writeWebEnv(next)
  return next
}
