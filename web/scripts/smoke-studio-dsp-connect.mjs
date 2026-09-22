#!/usr/bin/env node
/**
 * Persist DistroKid FTP store links + run Connect stores (Odesli / MusicBrainz fan-out).
 *
 * Usage:
 *   node scripts/smoke-studio-dsp-connect.mjs
 *   SMOKE_BASE=http://localhost:3001 node scripts/smoke-studio-dsp-connect.mjs
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[t.slice(0, i).trim()] = v
  }
  return env
}

const env = { ...loadEnv(), ...process.env }
const base = String(env.SMOKE_BASE || process.argv[2] || 'http://localhost:3001').replace(/\/$/, '')
const email = (env.E2E_ADMIN_EMAIL || env.ADMIN_AUTO_LOGIN_EMAIL || '').trim()
const password = env.E2E_ADMIN_PASSWORD || env.ADMIN_AUTO_LOGIN_PASSWORD || ''
const FTP_UPC = '198669278325'
const FTP_UUID = '5C1488FB-FC97-48F3-9336AA68186A845B'

function fail(msg) {
  console.error(`[studio-dsp-connect-smoke] FAIL — ${msg}`)
  process.exit(1)
}

function ok(msg) {
  console.log(`[studio-dsp-connect-smoke] OK — ${msg}`)
}

async function loginCookieJar() {
  if (!email || !password) {
    fail('Set E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (or ADMIN_AUTO_LOGIN_*) in web/.env.local')
  }

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: true }),
  })
  const jar = (loginRes.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ')
  if (loginRes.ok && jar) return jar

  const auto = await fetch(`${base}/api/auth/auto-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).catch(() => null)
  if (auto?.ok) {
    const autoJar = (auto.headers.getSetCookie?.() || [])
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ')
    if (autoJar) return autoJar
  }

  fail(`Login failed (${loginRes.status})`)
}

function loadFtpCatalog() {
  const catalogPath = path.join(webRoot, 'data/distrokid-catalog-export.json')
  if (!existsSync(catalogPath)) fail(`Missing ${catalogPath}`)
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const releases = (raw.releases || []).filter(
    (r) =>
      String(r.upc || '') === FTP_UPC ||
      String(r.albumuuid || '').toUpperCase() === FTP_UUID ||
      String(r.title || '').toUpperCase() === 'FTP'
  )
  if (!releases.length) fail('FTP release not found in distrokid-catalog-export.json')
  return {
    version: raw.version || 2,
    source: 'distrokid',
    extracted_at: new Date().toISOString(),
    releases,
  }
}

async function main() {
  ok(`base ${base}`)
  const cookie = await loginCookieJar()
  ok('authenticated')

  const catalog = loadFtpCatalog()
  const ftp = catalog.releases[0]
  ok(`FTP catalog: ${ftp.title} · UPC ${ftp.upc} · ${ftp.store_links?.length || 0} links · ${ftp.submitted_stores?.length || 0} submitted`)

  const importRes = await fetch(`${base}/api/studio/releases/from-distrokid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      catalog,
      dryRun: false,
      fillEmptyOnly: false,
      matchVault: true,
    }),
  })
  const importJson = await importRes.json().catch(() => ({}))
  if (![200, 201].includes(importRes.status)) {
    fail(`from-distrokid ${importRes.status}: ${importJson.error || JSON.stringify(importJson)}`)
  }
  const row = (importJson.releases || [])[0]
  if (!row?.release_id) fail('Import returned no release_id')
  ok(`imported ${row.status} → ${row.release_id}`)
  const linkStatuses = (row.store_links || []).map((l) => `${l.store}:${l.status}`).join(', ')
  ok(`store_links ${linkStatuses || '(none)'}`)

  const connectRes = await fetch(
    `${base}/api/studio/releases/${encodeURIComponent(row.release_id)}/dsp-connect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        seedUrl: 'https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH',
        persist: true,
        updateTargets: true,
      }),
    }
  )
  const connectJson = await connectRes.json().catch(() => ({}))
  if (![200, 422].includes(connectRes.status)) {
    fail(`dsp-connect ${connectRes.status}: ${connectJson.error || JSON.stringify(connectJson)}`)
  }
  ok(
    `connect ${connectRes.status}: ${(connectJson.links || []).length} links · added=${(connectJson.persisted?.added || []).join(',') || '—'} · targets=${(connectJson.targetStores || []).length}`
  )

  const detail = await fetch(`${base}/api/studio/releases/${encodeURIComponent(row.release_id)}`, {
    headers: { Cookie: cookie },
  })
  const detailJson = await detail.json().catch(() => ({}))
  if (!detail.ok) fail(`GET release ${detail.status}`)
  const stores = (detailJson.storeLinks || detailJson.store_links || []).map((l) => l.store)
  const required = ['spotify', 'apple_music', 'amazon', 'deezer', 'iheart']
  const missing = required.filter((s) => !stores.includes(s))
  if (missing.length) {
    fail(`release missing store links after persist: ${missing.join(', ')} (have: ${stores.join(', ') || 'none'})`)
  }
  ok(`persisted links: ${stores.join(', ')}`)
  ok('done')
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
