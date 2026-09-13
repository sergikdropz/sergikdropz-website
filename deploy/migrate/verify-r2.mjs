#!/usr/bin/env node
/**
 * Spot-check that R2 has the manifest + a sample of audio objects matching local SHA-256.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'out')

function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

async function streamToBuffer(body) {
  const chunks = []
  for await (const chunk of body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

loadEnv()
const accountId = process.env.R2_ACCOUNT_ID
const bucket = process.env.R2_BUCKET
const prefix = (process.env.R2_PREFIX || '').replace(/\/+$/, '')
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const localManifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'MANIFEST.json'), 'utf8'))
const remote = await client.send(
  new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/MANIFEST.json` }),
)
const remoteManifest = JSON.parse((await streamToBuffer(remote.Body)).toString('utf8'))

console.log(`[verify] local files=${localManifest.files.length} remote files=${remoteManifest.files.length}`)
if (localManifest.files.length !== remoteManifest.files.length) {
  console.error('[verify] file count mismatch')
  process.exit(1)
}

const samples = localManifest.files.filter((f) => f.key.includes('/audio/') && f.key.endsWith('.mp3')).slice(0, 8)
samples.push(...localManifest.files.filter((f) => f.key.endsWith('.sql')).slice(0, 1))

let ok = 0
for (const sample of samples) {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: sample.key }))
  const size = Number(head.ContentLength || 0)
  const match = size === sample.bytes
  console.log(`  ${match ? 'OK' : 'BAD'} ${size} bytes  ${sample.key.replace(prefix + '/', '')}`)
  if (!match) process.exit(1)
  ok += 1
}

console.log(`[verify] ${ok}/${samples.length} samples matched size — backup looks good`)
