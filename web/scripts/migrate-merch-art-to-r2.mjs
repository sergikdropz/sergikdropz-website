#!/usr/bin/env node
/**
 * One-off migration: copy merch artwork from Supabase Storage
 * (gallery-images/merch-designs) into Cloudflare R2 (bucket under the `merch/`
 * prefix), then rewrite stored design URLs to the R2 public base (r2.dev / custom
 * domain) or, if none is configured, the same-origin R2-backed proxy route.
 *
 * Idempotent: re-running skips objects already present in R2 and only rewrites
 * URLs that still point at Supabase.
 *
 * Usage: node scripts/migrate-merch-art-to-r2.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')
const DRY = process.argv.includes('--dry')

// --- Load .env.local ---------------------------------------------------------
const envPath = join(webRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const R2 = {
  accountId: process.env.R2_ACCOUNT_ID?.trim(),
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim(),
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim(),
  bucket: process.env.R2_BUCKET?.trim(),
}
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_IMAGE_BASE || process.env.R2_IMAGE_PUBLIC_BASE || '')
  .replace(/\/+$/, '')

for (const [k, v] of Object.entries(R2)) {
  if (!v) { console.error(`Missing R2_${k === 'bucket' ? 'BUCKET' : ''} env (${k})`); process.exit(1) }
}
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing Supabase env'); process.exit(1) }

const SUPA_BUCKET = 'gallery-images'
const SUPA_PREFIX = 'merch-designs'
const R2_PREFIX = 'merch/'
const ART_ID = /^[0-9a-f-]{36}\.(png|jpg)$/i

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
})
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

function publicUrlFor(id) {
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${R2_PREFIX}${id}` : `/api/merch/art/${id}`
}

async function r2Has(id) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2.bucket, Key: `${R2_PREFIX}${id}` }))
    return true
  } catch { return false }
}

async function copyToR2(id) {
  if (await r2Has(id)) return 'exists'
  const path = `${SUPA_PREFIX}/${id}`
  const { data, error } = await supabase.storage.from(SUPA_BUCKET).download(path)
  if (error || !data) throw new Error(`download ${id}: ${error?.message || 'no data'}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  const contentType = id.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'
  if (DRY) return 'would-copy'
  await s3.send(new PutObjectCommand({
    Bucket: R2.bucket,
    Key: `${R2_PREFIX}${id}`,
    Body: bytes,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return 'copied'
}

async function main() {
  console.log(`Migrating merch art → R2 (bucket=${R2.bucket}, base=${PUBLIC_BASE || 'proxy /api/merch/art'})${DRY ? ' [DRY RUN]' : ''}`)

  // 1) List every object in Supabase merch-designs/
  const { data: listed, error: listErr } = await supabase.storage
    .from(SUPA_BUCKET)
    .list(SUPA_PREFIX, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })
  if (listErr) { console.error('Supabase list error:', listErr.message); process.exit(1) }
  const ids = (listed || []).map((o) => o.name).filter((n) => ART_ID.test(n))
  console.log(`Found ${ids.length} objects in Supabase.`)

  const stats = { copied: 0, exists: 0, would: 0, failed: 0 }
  for (const id of ids) {
    try {
      const r = await copyToR2(id)
      if (r === 'copied') { stats.copied++; console.log(`  ✓ copied ${id}`) }
      else if (r === 'exists') { stats.exists++ }
      else { stats.would++; console.log(`  · would copy ${id}`) }
    } catch (e) {
      stats.failed++
      console.warn(`  ✗ ${id}: ${e.message}`)
    }
  }
  console.log(`Objects → copied:${stats.copied} exists:${stats.exists} would:${stats.would} failed:${stats.failed}`)

  // 2) Rewrite merch-designs.json URLs that still point at Supabase.
  const designsPath = join(webRoot, 'data', 'merch-designs.json')
  const raw = JSON.parse(readFileSync(designsPath, 'utf8'))
  const designs = Array.isArray(raw) ? raw : (raw.designs || [])
  let rewrites = 0
  const idFromUrl = (url) => {
    const name = String(url).split(/[?#]/)[0].split('/').pop() || ''
    return ART_ID.test(name) ? name : null
  }
  for (const d of designs) {
    for (const p of d.placements || []) {
      if (!p?.assetUrl) continue
      const id = idFromUrl(p.assetUrl)
      if (!id) continue
      if (/supabase\.co\/storage/i.test(p.assetUrl) || p.assetUrl.startsWith('/api/merch/art/')) {
        const version = String(p.assetUrl).split('?')[1]
        const next = publicUrlFor(id) + (version ? `?${version}` : '')
        if (next !== p.assetUrl) { p.assetUrl = next; rewrites++ }
      }
    }
  }
  console.log(`Design URL rewrites: ${rewrites}`)
  if (!DRY && rewrites > 0) {
    writeFileSync(designsPath, JSON.stringify(raw, null, 2) + '\n')
    console.log(`Wrote ${designsPath}`)
  }

  console.log('Done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
