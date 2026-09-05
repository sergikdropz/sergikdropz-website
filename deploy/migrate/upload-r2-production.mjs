#!/usr/bin/env node
/**
 * Upload vault MP3s + waveforms to R2 for production streaming.
 *
 * Object layout (matches media proxy: {ORIGIN}/audio/{relative}):
 *   audio/unreleased/...
 *   waveforms/...
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, OUT_DIR, REPO_ROOT } from './lib/load-env.mjs'
import {
  createR2Client,
  ensureBucket,
  r2Bucket,
  sha256File,
  uploadFile,
  walkFiles,
} from './lib/r2-client.mjs'

loadEnv({ required: true })

const client = createR2Client()
const bucket = r2Bucket()
const skipExisting = process.env.R2_SKIP_EXISTING !== '0'

const audioRoot = path.join(REPO_ROOT, 'web/public/audio')
const waveformRoot = path.join(REPO_ROOT, 'web/public/waveforms')

const jobs = [
  ...walkFiles(audioRoot).map((local) => ({
    local,
    key: `audio/${path.relative(audioRoot, local).split(path.sep).join('/')}`,
  })),
  ...walkFiles(waveformRoot).map((local) => ({
    local,
    key: `waveforms/${path.relative(waveformRoot, local).split(path.sep).join('/')}`,
  })),
]

if (jobs.length === 0) {
  console.error('[upload-r2-production] no files under web/public/audio or waveforms')
  process.exit(1)
}

console.log(`[upload-r2-production] bucket=${bucket} files=${jobs.length}`)
const bucketInfo = await ensureBucket(client, bucket)
if (bucketInfo.created) console.log('[upload-r2-production] created bucket')

fs.mkdirSync(OUT_DIR, { recursive: true })
const manifest = {
  kind: 'production',
  createdAt: new Date().toISOString(),
  bucket,
  files: [],
  totals: { uploaded: 0, skipped: 0, bytes: 0 },
}

let i = 0
for (const job of jobs) {
  i += 1
  process.stdout.write(`[${i}/${jobs.length}] ${job.key} … `)
  try {
    const result = await uploadFile(client, bucket, job.key, job.local, { skipExisting })
    manifest.files.push({
      key: job.key,
      bytes: result.bytes,
      sha256: sha256File(job.local),
      skipped: result.skipped,
    })
    if (result.skipped) {
      manifest.totals.skipped += 1
      console.log('skip')
    } else {
      manifest.totals.uploaded += 1
      manifest.totals.bytes += result.bytes
      console.log(`ok ${(result.bytes / (1024 * 1024)).toFixed(2)} MB`)
    }
  } catch (err) {
    console.log('FAIL')
    console.error(err)
    process.exit(1)
  }
}

const manifestPath = path.join(OUT_DIR, 'MANIFEST.production.json')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
await uploadFile(client, bucket, 'MANIFEST.production.json', manifestPath, { skipExisting: false })

console.log(
  `[upload-r2-production] done — uploaded=${manifest.totals.uploaded} skipped=${manifest.totals.skipped} bytes=${(
    manifest.totals.bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`,
)
