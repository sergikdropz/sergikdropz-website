#!/usr/bin/env node
/**
 * Duplicate local vault + DB dump into Cloudflare R2 (backup only — no cutover).
 *
 * Uploads:
 *   <prefix>/db/sergik-public.dump.sql
 *   <prefix>/audio/**          (from web/public/audio)
 *   <prefix>/waveforms/**      (from web/public/waveforms)
 *   <prefix>/MANIFEST.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(__dirname, 'out')

function loadEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('Missing deploy/migrate/.env — copy .env.example and fill R2_* keys.')
    process.exit(1)
  }
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

function required(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name} in deploy/migrate/.env`)
    process.exit(1)
  }
  return v
}

function walkFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(full)
      else if (ent.isFile()) out.push(full)
    }
  }
  return out
}

function sha256File(filePath) {
  const h = createHash('sha256')
  h.update(fs.readFileSync(filePath))
  return h.digest('hex')
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return (
    {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.json': 'application/json',
      '.sql': 'application/sql',
      '.md': 'text/markdown',
    }[ext] || 'application/octet-stream'
  )
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false
    throw err
  }
}

async function uploadFile(client, bucket, key, filePath, { skipExisting }) {
  if (skipExisting && (await objectExists(client, bucket, key))) {
    return { key, skipped: true, bytes: fs.statSync(filePath).size }
  }
  const body = fs.createReadStream(filePath)
  const size = fs.statSync(filePath).size
  // Multipart for anything over 8 MB (most MP3s)
  if (size > 8 * 1024 * 1024) {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType(filePath),
      },
      queueSize: 3,
      partSize: 8 * 1024 * 1024,
    })
    await upload.done()
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.readFileSync(filePath),
        ContentType: contentType(filePath),
      }),
    )
  }
  return { key, skipped: false, bytes: size }
}

loadEnv()

const accountId = required('R2_ACCOUNT_ID')
const accessKeyId = required('R2_ACCESS_KEY_ID')
const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
const bucket = required('R2_BUCKET')
const prefix = (process.env.R2_PREFIX || `backup/${new Date().toISOString().slice(0, 10)}`).replace(
  /\/+$/,
  '',
)
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
const skipExisting = process.env.R2_SKIP_EXISTING !== '0'

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
})

const dumpPath = path.join(OUT_DIR, 'sergik-public.dump.sql')
if (!fs.existsSync(dumpPath)) {
  console.error(`Missing ${dumpPath} — run: npm run backup:dump-db`)
  process.exit(1)
}

const audioRoot = path.join(ROOT, 'web/public/audio')
const waveformRoot = path.join(ROOT, 'web/public/waveforms')

const jobs = [
  { local: dumpPath, key: `${prefix}/db/sergik-public.dump.sql` },
  ...walkFiles(audioRoot).map((local) => ({
    local,
    key: `${prefix}/audio/${path.relative(audioRoot, local).split(path.sep).join('/')}`,
  })),
  ...walkFiles(waveformRoot).map((local) => ({
    local,
    key: `${prefix}/waveforms/${path.relative(waveformRoot, local).split(path.sep).join('/')}`,
  })),
]

console.log(`[upload-r2] bucket=${bucket} prefix=${prefix} files=${jobs.length}`)
console.log(`[upload-r2] endpoint=${endpoint}`)

const manifest = {
  createdAt: new Date().toISOString(),
  bucket,
  prefix,
  files: [],
  totals: { uploaded: 0, skipped: 0, bytes: 0 },
}

let i = 0
for (const job of jobs) {
  i += 1
  const label = job.key.slice(prefix.length + 1)
  process.stdout.write(`[${i}/${jobs.length}] ${label} … `)
  try {
    const result = await uploadFile(client, bucket, job.key, job.local, { skipExisting })
    const hash = sha256File(job.local)
    manifest.files.push({
      key: job.key,
      bytes: result.bytes,
      sha256: hash,
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

const manifestPath = path.join(OUT_DIR, 'MANIFEST.json')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
await uploadFile(client, bucket, `${prefix}/MANIFEST.json`, manifestPath, { skipExisting: false })

console.log(
  `[upload-r2] done — uploaded=${manifest.totals.uploaded} skipped=${manifest.totals.skipped} bytes=${(
    manifest.totals.bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`,
)
console.log(`[upload-r2] manifest → ${prefix}/MANIFEST.json`)
