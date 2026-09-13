import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { requiredEnv } from './load-env.mjs'

export function createR2Client() {
  const accountId = requiredEnv('R2_ACCOUNT_ID')
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  })
}

export function r2Bucket() {
  return requiredEnv('R2_BUCKET')
}

export function contentType(filePath) {
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

export function walkFiles(dir) {
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

export function sha256File(filePath) {
  const h = createHash('sha256')
  h.update(fs.readFileSync(filePath))
  return h.digest('hex')
}

export async function ensureBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { created: false }
  } catch (err) {
    if (err?.$metadata?.httpStatusCode !== 404 && err?.name !== 'NotFound') throw err
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }))
  return { created: true }
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

export async function uploadFile(client, bucket, key, filePath, { skipExisting = true } = {}) {
  if (skipExisting && (await objectExists(client, bucket, key))) {
    return { key, skipped: true, bytes: fs.statSync(filePath).size }
  }
  const size = fs.statSync(filePath).size
  const ct = contentType(filePath)
  const cacheable = ct.startsWith('audio/') || ct === 'application/json'
  const common = {
    Bucket: bucket,
    Key: key,
    ContentType: ct,
    ...(cacheable ? { CacheControl: 'public, max-age=31536000, immutable' } : {}),
  }
  if (size > 8 * 1024 * 1024) {
    const upload = new Upload({
      client,
      params: { ...common, Body: fs.createReadStream(filePath) },
      queueSize: 3,
      partSize: 8 * 1024 * 1024,
    })
    await upload.done()
  } else {
    await client.send(new PutObjectCommand({ ...common, Body: fs.readFileSync(filePath) }))
  }
  return { key, skipped: false, bytes: size }
}
