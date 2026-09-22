#!/usr/bin/env node
/**
 * Release Collab Resend setup helper.
 *
 * Requires RESEND_API_KEY in web/.env.local (or the environment).
 * Optionally sets/prints RESEND_WEBHOOK_SECRET when creating a webhook.
 *
 * Usage:
 *   node scripts/setup-release-collab-resend.mjs
 *   node scripts/setup-release-collab-resend.mjs --create-webhook
 *   WEBHOOK_URL=https://sergikdropz.com/api/webhooks/resend node scripts/setup-release-collab-resend.mjs --create-webhook
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const createWebhook = process.argv.includes('--create-webhook')

function loadEnv() {
  const envPath = path.join(webRoot, '.env.local')
  const env = { ...process.env }
  if (!existsSync(envPath)) return env
  for (const line of readFileSync(envPath, 'utf8').split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    const k = t.slice(0, i).trim()
    if (!(k in env) || env[k] === '') env[k] = v
  }
  return env
}

const env = loadEnv()
const apiKey = (env.RESEND_API_KEY || '').trim()
const fromCollab = 'release.studio@sergikdropz.com'
const webhookUrl = (
  env.WEBHOOK_URL ||
  `${(env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').replace(/\/$/, '')}/api/webhooks/resend`
).trim()

if (!apiKey || apiKey.startsWith('your-') || apiKey === 're_...') {
  console.error('[release-collab-resend] RESEND_API_KEY is missing in web/.env.local')
  console.error('  1. Create a key at https://resend.com/api-keys')
  console.error('  2. Add: RESEND_API_KEY=re_...')
  console.error('  3. Verify domain sergikdropz.com (any @sergikdropz.com sender then works)')
  console.error(`  4. Re-run: node scripts/setup-release-collab-resend.mjs --create-webhook`)
  process.exit(1)
}

async function resend(pathname, init = {}) {
  const res = await fetch(`https://api.resend.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || res.statusText
    throw new Error(`${init.method || 'GET'} ${pathname} → ${res.status}: ${msg}`)
  }
  return json
}

console.log('[release-collab-resend] Checking Resend account…')
const domains = await resend('/domains')
const domainList = domains?.data || domains || []
const rows = Array.isArray(domainList) ? domainList : []
const sergik = rows.find((d) => String(d.name || '').toLowerCase() === 'sergikdropz.com')

if (!rows.length) {
  console.warn('[release-collab-resend] No domains found. Add sergikdropz.com in Resend → Domains.')
} else {
  console.log(
    '[release-collab-resend] Domains:',
    rows.map((d) => `${d.name} (${d.status || d.region || 'ok'})`).join(', ') || '(none)',
  )
}

if (sergik) {
  console.log(
    `[release-collab-resend] sergikdropz.com status=${sergik.status || 'unknown'} — From ${fromCollab} is allowed once domain is verified.`,
  )
} else {
  console.warn(
    `[release-collab-resend] sergikdropz.com not listed yet. Verify it before sending as ${fromCollab}.`,
  )
}

// Probe: dry-run send is not available; list webhooks instead
let webhooks = []
try {
  const wh = await resend('/webhooks')
  webhooks = wh?.data || wh || []
  if (!Array.isArray(webhooks)) webhooks = []
} catch (err) {
  console.warn('[release-collab-resend] Could not list webhooks:', err instanceof Error ? err.message : err)
}

const existing = webhooks.find((w) => String(w.endpoint || w.url || '') === webhookUrl)
if (existing) {
  console.log('[release-collab-resend] Webhook already exists for', webhookUrl, `(id=${existing.id})`)
} else if (createWebhook) {
  console.log('[release-collab-resend] Creating webhook →', webhookUrl)
  const created = await resend('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: webhookUrl,
      events: [
        'email.sent',
        'email.delivered',
        'email.opened',
        'email.bounced',
        'email.complained',
      ],
    }),
  })
  const secret = created?.signing_secret || created?.data?.signing_secret || null
  const id = created?.id || created?.data?.id
  console.log('[release-collab-resend] Webhook created id=', id)
  if (secret) {
    const envPath = path.join(webRoot, '.env.local')
    const line = `\n# Release Collab Resend webhook (auto-appended ${new Date().toISOString().slice(0, 10)})\nRESEND_WEBHOOK_SECRET=${secret}\n`
    const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    if (!/^\s*RESEND_WEBHOOK_SECRET=/m.test(current)) {
      appendFileSync(envPath, line)
      console.log('[release-collab-resend] Appended RESEND_WEBHOOK_SECRET to web/.env.local')
    } else {
      console.log('[release-collab-resend] RESEND_WEBHOOK_SECRET already present — new secret:', secret)
      console.log('  Update .env.local manually if you rotated the webhook.')
    }
  } else {
    console.log(
      '[release-collab-resend] No signing_secret in response — copy it from Resend → Webhooks UI into RESEND_WEBHOOK_SECRET',
    )
  }
} else {
  console.log('[release-collab-resend] No webhook for', webhookUrl)
  console.log('  Re-run with --create-webhook to create it (use production URL for Vercel).')
}

console.log('[release-collab-resend] Done.')
console.log('  Local portal base:', env.NEXT_PUBLIC_SITE_URL || '(unset)')
console.log('  Collab From:', fromCollab)
console.log('  Next: npm run dev:restart  (after adding RESEND_API_KEY / webhook secret)')
