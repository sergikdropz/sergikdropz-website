#!/usr/bin/env node
/**
 * Spot-check production R2 layout (+ optional public URL).
 */
import fs from 'node:fs'
import path from 'node:path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { loadEnv, OUT_DIR } from './lib/load-env.mjs'
import { createR2Client, r2Bucket } from './lib/r2-client.mjs'

loadEnv({ required: true })

const client = createR2Client()
const bucket = r2Bucket()
const manifestPath = path.join(OUT_DIR, 'MANIFEST.production.json')
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath} — run: npm run r2:production:upload`)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const samples = manifest.files.filter((f) => f.key.startsWith('audio/') && f.key.endsWith('.mp3')).slice(0, 8)
if (samples.length === 0) {
  console.error('[verify-r2-production] no audio samples in manifest')
  process.exit(1)
}

console.log(`[verify-r2-production] checking ${samples.length} samples in ${bucket}`)
let ok = 0
for (const sample of samples) {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sample.key }))
  const size = Number(head.ContentLength || 0)
  const match = size === sample.bytes
  console.log(`  ${match ? 'OK' : 'BAD'} ${size} bytes  ${sample.key}`)
  if (!match) process.exit(1)
  ok += 1
}

console.log(`[verify-r2-production] ${ok}/${samples.length} R2 objects matched`)

const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '')
if (publicBase) {
  const url = `${publicBase}/${samples[0].key.split('/').map(encodeURIComponent).join('/')}`
  const res = await fetch(url, { method: 'HEAD' })
  console.log(`[verify-r2-production] public HEAD ${res.status}`)
} else {
  console.log('[verify-r2-production] private R2 mode (no public URL)')
}

console.log('[verify-r2-production] OK')
