/**
 * Production / local smoke for vault playback:
 *  - health (prod) or resolve reachability
 *  - /api/audio/resolve for FTP
 *  - Range GET on play URL + fallbackUrl
 *  - If play URL is R2, require Access-Control-Allow-Origin
 *
 * Usage:
 *   node scripts/smoke-r2-playback.mjs
 *   node scripts/smoke-r2-playback.mjs https://sergikdropz.com
 *   SMOKE_BASE=http://127.0.0.1:3001 node scripts/smoke-r2-playback.mjs
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(file) {
  try {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq)
      const value = trimmed.slice(eq + 1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

const BASE = (process.argv[2] || process.env.SMOKE_BASE || 'https://sergikdropz.com').replace(
  /\/+$/,
  '',
)
const TRACK =
  process.env.SMOKE_TRACK || 'unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3'
const ORIGINS = [
  'https://sergikdropz.com',
  'http://127.0.0.1:3001',
]

function isLocal(base) {
  return /127\.0\.0\.1|localhost/i.test(base)
}

function isR2(url) {
  return /r2\.cloudflarestorage\.com|\.r2\.dev/i.test(url)
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { res, json }
}

async function rangeGet(url, origin) {
  const headers = { Range: 'bytes=0-1' }
  if (origin) headers.Origin = origin
  const res = await fetch(url, { method: 'GET', headers, redirect: 'follow' })
  return {
    status: res.status,
    type: res.headers.get('content-type') || '',
    acao: res.headers.get('access-control-allow-origin') || '',
    acceptRanges: res.headers.get('accept-ranges') || '',
  }
}

function absUrl(url) {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

async function probeDirectR2Cors() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return { skipped: true, reason: 'no local R2 credentials' }
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  const Key = `audio/${TRACK.replace(/^\/+/, '').replace(/^audio\//i, '')}`
  const signed = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key }), {
    expiresIn: 300,
  })
  const results = []
  for (const origin of ORIGINS) {
    results.push({ origin, ...(await rangeGet(signed, origin)) })
  }
  return { signed: signed.split('?')[0], results }
}

const failures = []

console.log(`[r2-smoke] base=${BASE} track=${TRACK}`)

if (!isLocal(BASE)) {
  const health = await fetchJson(`${BASE}/api/health`)
  const ok = health.res.ok || health.json?.ok === true || health.json?.status === 'ok'
  console.log(`[r2-smoke] health ${health.res.status} ok=${Boolean(ok)}`)
  if (!ok && health.res.status !== 200) {
    failures.push(`health ${health.res.status}`)
  }
}

const resolveUrl = `${BASE}/api/audio/resolve?path=${encodeURIComponent(TRACK)}`
const resolved = await fetchJson(resolveUrl)
console.log(
  `[r2-smoke] resolve ${resolved.res.status} source=${resolved.json?.source || 'n/a'}`,
)
if (!resolved.res.ok || !resolved.json?.url) {
  failures.push(`resolve failed: ${resolved.res.status}`)
} else {
  const play = absUrl(resolved.json.url)
  const fallback = absUrl(resolved.json.fallbackUrl || '')
  const playHit = await rangeGet(play, 'https://sergikdropz.com')
  console.log(
    `[r2-smoke] play ${resolved.json.source} ${playHit.status} ${playHit.type} acao=${playHit.acao || '(none)'}`,
  )
  if (playHit.status !== 200 && playHit.status !== 206) {
    failures.push(`play URL ${playHit.status}`)
  }
  if (isR2(play)) {
    if (!playHit.acao) {
      failures.push('presigned play URL missing Access-Control-Allow-Origin (CORS not applied)')
    }
  } else if (!play.includes('/api/audio/media/')) {
    failures.push(`unexpected play URL host: ${play}`)
  }

  if (fallback && fallback !== play) {
    const fb = await rangeGet(fallback, 'https://sergikdropz.com')
    console.log(`[r2-smoke] fallback proxy ${fb.status} ${fb.type}`)
    if (fb.status !== 200 && fb.status !== 206) failures.push(`fallback ${fb.status}`)
  }
}

const cors = await probeDirectR2Cors()
if (cors.skipped) {
  console.log(`[r2-smoke] direct R2 CORS probe skipped (${cors.reason})`)
} else {
  for (const row of cors.results) {
    console.log(
      `[r2-smoke] R2 Origin ${row.origin} → ${row.status} acao=${row.acao || '(none)'}`,
    )
  }
  const green = cors.results.some((row) => (row.status === 200 || row.status === 206) && row.acao)
  if (!green) {
    console.log('[r2-smoke] R2 CORS not ready — keep R2_BROWSER_PLAY unset (proxy play).')
  } else {
    console.log('[r2-smoke] R2 CORS ready — safe to set R2_BROWSER_PLAY=1 after a proxy-green deploy.')
  }
}

if (failures.length) {
  console.error(`[r2-smoke] FAIL\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('[r2-smoke] OK')
