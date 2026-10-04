#!/usr/bin/env node
/**
 * Public + optional authenticated checks for YouTube subscribe gate.
 *
 * Usage:
 *   node scripts/smoke-youtube-subscribe-gate.mjs
 *   SMOKE_BASE=https://sergikdropz.com node scripts/smoke-youtube-subscribe-gate.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')

function loadEnvFile(name) {
  const envPath = path.join(webRoot, name)
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

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...process.env }
const base = String(env.SMOKE_BASE || process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '')

function fail(msg) {
  console.error(`[yt-sub-gate-smoke] FAIL — ${msg}`)
  process.exit(1)
}

function ok(msg) {
  console.log(`[yt-sub-gate-smoke] OK — ${msg}`)
}

async function main() {
  const statusRes = await fetch(`${base}/api/youtube/subscribe-gate/status`, {
    cache: 'no-store',
  })
  if (!statusRes.ok) fail(`status HTTP ${statusRes.status}`)
  const status = await statusRes.json()
  if (typeof status.unlocked !== 'boolean') fail('status missing unlocked boolean')
  if (typeof status.configured !== 'boolean') fail('status missing configured boolean')
  if (typeof status.channel !== 'string' || !status.channel.trim()) fail('status missing channel')
  ok(
    `status channel=@${status.channel} configured=${status.configured} unlocked=${status.unlocked} subscribers=${status.subscriberCount ?? 'n/a'}`,
  )

  const ackRes = await fetch(`${base}/api/youtube/subscribe-gate/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const ack = await ackRes.json().catch(() => ({}))
  if (!ackRes.ok || ack.unlocked !== false || ack.needsAccount !== true) {
    fail('ack without token must return needsAccount (no silent unlock)')
  }
  ok('ack rejects empty body (subscription required)')

  const startRes = await fetch(`${base}/api/youtube/subscribe-gate/start?next=${encodeURIComponent('/music-library')}`, {
    redirect: 'manual',
  })
  if (startRes.status !== 307 && startRes.status !== 302) {
    fail(`start expected redirect, got ${startRes.status}`)
  }
  const location = startRes.headers.get('location') || ''
  if (status.configured) {
    if (!location.includes('accounts.google.com')) {
      fail(`start should redirect to Google OAuth when configured; got ${location}`)
    }
    ok('start redirects to Google OAuth')
  } else if (!location.includes('ytgate=unconfigured')) {
    fail(`start should redirect with ytgate=unconfigured when OAuth missing; got ${location}`)
  } else {
    ok('start reports unconfigured (set YOUTUBE_OAUTH_* on host)')
  }

  const apiKey = (env.YOUTUBE_API_KEY || '').trim()
  if (apiKey) {
    const handle = (env.YOUTUBE_CHANNEL_ID || '@sergikdropz').replace(/^@/, '')
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,id&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(apiKey)}`,
    )
    if (!chRes.ok) fail(`YouTube Data API channels lookup HTTP ${chRes.status}`)
    const ch = await chRes.json()
    const item = ch?.items?.[0]
    const count = item?.statistics?.subscriberCount
    ok(`YouTube Data API @${handle} channelId=${item?.id || '?'} subscribers=${count ?? 'hidden'}`)
    if (status.configured && status.subscriberCount == null && count != null) {
      console.warn(
        '[yt-sub-gate-smoke] WARN — host status.subscriberCount null but API key works (check YOUTUBE_CHANNEL_ID on server)',
      )
    }
  } else {
    console.log('[yt-sub-gate-smoke] SKIP — YOUTUBE_API_KEY not in env (optional direct API check)')
  }

  console.log('[yt-sub-gate-smoke] done')
}

main().catch((err) => fail(err?.message || String(err)))
