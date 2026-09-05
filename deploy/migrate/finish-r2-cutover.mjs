#!/usr/bin/env node
/**
 * Cut production over to private R2 (S3 API) — no public r2.dev required.
 *
 * Sets Vercel:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   NEXT_PUBLIC_AUDIO_BASE_URL / AUDIO_ORIGIN → r2://sergik-vault (sentinel for proxy rewrite)
 *
 * Then redeploys and smoke-tests /api/audio/media/...
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { loadEnv, requiredEnv, REPO_ROOT } from './lib/load-env.mjs'

loadEnv({ required: true })

const accountId = requiredEnv('R2_ACCOUNT_ID')
const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY')
const bucket = requiredEnv('R2_BUCKET')
const webDir = path.join(REPO_ROOT, 'web')
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com'
const sentinel = `r2://${bucket}`
const sampleKey =
  process.env.R2_SMOKE_AUDIO_KEY ||
  'audio/unreleased/Playlists/Party Time/SERGIK - Can You Dance v2.mp3'

function runShell(cmd) {
  const r = spawnSync('/bin/bash', ['-lc', cmd], { encoding: 'utf8', stdio: 'inherit', cwd: webDir })
  if (r.status !== 0) process.exit(r.status || 1)
}

function runShellCapture(cmd) {
  const r = spawnSync('/bin/bash', ['-lc', cmd], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: webDir,
  })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    process.exit(r.status || 1)
  }
  return (r.stdout || '').trim()
}

function setVercelEnv(name, value) {
  runShell(`npx vercel env rm ${name} production --yes 2>/dev/null || true`)
  // Escape single quotes for printf
  const escaped = value.replace(/'/g, `'\\''`)
  runShell(`printf '%s' '${escaped}' | npx vercel env add ${name} production`)
}

console.log(`[finish-r2-cutover] private R2 bucket=${bucket}`)

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

try {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sampleKey }))
  console.log(`[finish-r2-cutover] R2 HEAD ok — ${head.ContentLength} bytes`)
} catch (err) {
  console.error(`[finish-r2-cutover] sample missing in R2: ${sampleKey}`)
  console.error(err?.message || err)
  process.exit(1)
}

// Local env
const envLocal = path.join(webDir, '.env.local')
if (fs.existsSync(envLocal)) {
  let text = fs.readFileSync(envLocal, 'utf8')
  const updates = {
    NEXT_PUBLIC_AUDIO_BASE_URL: sentinel,
    AUDIO_ORIGIN: sentinel,
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET: bucket,
  }
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    const line = `${key}=${value}`
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`
  }
  fs.writeFileSync(envLocal, text)
  console.log('[finish-r2-cutover] updated web/.env.local')
}

// Vercel production (server secrets + public sentinel)
setVercelEnv('R2_ACCOUNT_ID', accountId)
setVercelEnv('R2_ACCESS_KEY_ID', accessKeyId)
setVercelEnv('R2_SECRET_ACCESS_KEY', secretAccessKey)
setVercelEnv('R2_BUCKET', bucket)
setVercelEnv('NEXT_PUBLIC_AUDIO_BASE_URL', sentinel)
setVercelEnv('AUDIO_ORIGIN', sentinel)

// Fresh production deploy from monorepo root (Vercel Root Directory = web)
console.log('[finish-r2-cutover] deploying production…')
runShell(`cd '${REPO_ROOT.replace(/'/g, `'\\''`)}' && npx vercel deploy --prod --yes`)

runShell(`npm run health:probe -- '${siteUrl}'`)

const proxyUrl = `${siteUrl}/api/audio/media/unreleased/Playlists/Party%20Time/SERGIK%20-%20Can%20You%20Dance%20v2.mp3`
const proxy = await fetch(proxyUrl, { method: 'HEAD' })
console.log(`[finish-r2-cutover] prod audio proxy HEAD → ${proxy.status}`)
if (!proxy.ok) {
  console.error('[finish-r2-cutover] audio proxy failed after cutover')
  process.exit(1)
}

console.log('[finish-r2-cutover] OK — production streams from private R2 (Mac tunnel not required)')
