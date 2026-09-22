#!/usr/bin/env node
/**
 * Authenticated Studio marketing / social-promo smoke.
 *
 * Requires a logged-in admin cookie jar OR uses Playwright storage from e2e/.auth.
 * Default: hits localhost:3001 with cookies from E2E_ADMIN_* via a tiny login.
 *
 * Usage:
 *   node scripts/smoke-studio-social-promo.mjs
 *   SMOKE_BASE=https://sergikdropz.com node scripts/smoke-studio-social-promo.mjs
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

const env = { ...loadEnv(), ...process.env }
const base = String(env.SMOKE_BASE || process.argv[2] || 'http://localhost:3001').replace(/\/$/, '')
const email = (env.E2E_ADMIN_EMAIL || env.ADMIN_AUTO_LOGIN_EMAIL || '').trim()
const password = env.E2E_ADMIN_PASSWORD || env.ADMIN_AUTO_LOGIN_PASSWORD || ''

function fail(msg) {
  console.error(`[studio-social-promo-smoke] FAIL — ${msg}`)
  process.exit(1)
}

function ok(msg) {
  console.log(`[studio-social-promo-smoke] OK — ${msg}`)
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

  // Dev autologin fallback
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

  const body = await loginRes.json().catch(() => ({}))
  fail(
    `Could not obtain admin session (${loginRes.status}: ${body.error || 'no cookies'}). ` +
      'Run Playwright: npx playwright test e2e/studio-social-promo.spec.ts',
  )
}

async function main() {
  console.log(`[studio-social-promo-smoke] Base ${base}`)
  const cookie = await loginCookieJar()
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' }

  const board = await fetch(`${base}/api/studio/release-pipeline`, { headers })
  if (!board.ok) fail(`release-pipeline ${board.status}`)
  const boardJson = await board.json()
  const releases = boardJson.releases || []
  if (!Array.isArray(releases) || !releases.length) fail('release-pipeline returned no releases')
  if (!('social_promo' in releases[0])) fail('release-pipeline rows missing social_promo summary')
  ok(`release-pipeline ${releases.length} releases`)

  const target =
    releases.find((r) => r.release_date) ||
    releases.find((r) => (r.track_count || 0) > 0) ||
    releases[0]
  const id = target.id

  const get = await fetch(`${base}/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
    headers,
  })
  const getJson = await get.json().catch(() => ({}))
  if (!get.ok) fail(`social-promo GET ${get.status}: ${getJson.error || ''}`)
  if (getJson.column_missing) {
    fail('social_promo column missing — run node scripts/apply-social-promo-migration.mjs')
  }
  ok(`social-promo GET ${id} tracks=${(getJson.tracks || []).length}`)

  const put = await fetch(`${base}/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ generate: true }),
  })
  const putJson = await put.json().catch(() => ({}))
  if (!put.ok) fail(`social-promo PUT generate ${put.status}: ${putJson.error || putJson.hint || ''}`)
  const posts = putJson.plan?.posts || []
  if (posts.length < 8) fail(`expected >=8 promo posts, got ${posts.length}`)
  ok(`generated ${posts.length} promo slots`)

  const patch = await fetch(`${base}/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ post: { id: posts[0].id, status: 'ready' } }),
  })
  const patchJson = await patch.json().catch(() => ({}))
  if (!patch.ok) fail(`social-promo PUT patch ${patch.status}`)
  const updated = (patchJson.plan?.posts || []).find((p) => p.id === posts[0].id)
  if (updated?.status !== 'ready') fail('post status did not persist as ready')
  ok(`patched ${posts[0].id} → ready`)

  const reload = await fetch(`${base}/api/studio/releases/${encodeURIComponent(id)}/social-promo`, {
    headers,
  })
  const reloadJson = await reload.json().catch(() => ({}))
  const reloaded = (reloadJson.plan?.posts || []).find((p) => p.id === posts[0].id)
  if (reloaded?.status !== 'ready') fail('reload did not keep ready status')
  ok('persist + reload verified')

  console.log('[studio-social-promo-smoke] PASS')
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)))
