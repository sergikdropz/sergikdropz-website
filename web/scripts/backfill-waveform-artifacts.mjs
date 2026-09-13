#!/usr/bin/env node
/**
 * Backfill waveform peaks from audio_files.waveform_data into the audio-analysis
 * Storage bucket and record the public URLs on waveform_json_url / waveform_svg_url.
 *
 * Purely additive: waveform_data is left in place, so every existing reader keeps
 * working. It lets GET /api/audio/waveform serve peaks from the CDN instead of
 * reading a ~21 kB TOAST value out of Postgres on every track load.
 *
 * Paths match utils/analysisArtifacts.ts (waveforms/{audioFileId}.json|.svg).
 *
 * Usage:
 *   node scripts/backfill-waveform-artifacts.mjs --dry-run
 *   node scripts/backfill-waveform-artifacts.mjs
 *   node scripts/backfill-waveform-artifacts.mjs --force   # re-upload even if a URL exists
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'audio-analysis'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Mirrors waveformPeaksToSvg in utils/analysisArtifacts.ts.
function waveformPeaksToSvg(peaks, width = 1200, height = 240) {
  const safeWidth = Math.max(200, Math.floor(width))
  const safeHeight = Math.max(80, Math.floor(height))
  const midY = safeHeight / 2
  const maxAbs = peaks.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0) || 1
  const barWidth = safeWidth / Math.max(1, peaks.length)
  const bars = peaks
    .map((p, i) => {
      const v = clamp((Number(p) || 0) / maxAbs, -1, 1)
      const barH = Math.max(1, Math.abs(v) * midY)
      const x = i * barWidth
      const y = v >= 0 ? midY - barH : midY
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0.5, barWidth * 0.9).toFixed(2)}" height="${barH.toFixed(2)}" rx="0.5" ry="0.5" />`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect width="100%" height="100%" fill="transparent"/>
  <g fill="currentColor" opacity="0.9">
    ${bars}
  </g>
</svg>`
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`listBuckets: ${error.message}`)
  if (buckets?.some((b) => b.name === BUCKET)) return 'exists'
  if (dryRun) return 'would-create'
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['image/svg+xml', 'application/json', 'text/plain'],
  })
  if (createError) throw new Error(`createBucket: ${createError.message}`)
  return 'created'
}

async function upload(path, content, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(content, 'utf-8'), {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

console.log(`[waveform-backfill] ${dryRun ? 'DRY RUN' : 'LIVE'}${force ? ' (force)' : ''}`)
console.log(`[waveform-backfill] bucket: ${await ensureBucket()}`)

// Fetch ids first so the heavy waveform_data column is only read in small batches.
let idQuery = supabase.from('audio_files').select('id, waveform_json_url').not('waveform_data', 'is', null)
const { data: candidates, error: idError } = await idQuery
if (idError) {
  console.error('[waveform-backfill] id fetch failed:', idError.message)
  process.exit(1)
}

const todo = candidates.filter((r) => force || !r.waveform_json_url).map((r) => r.id)
console.log(
  `[waveform-backfill] ${candidates.length} rows have waveform_data, ${todo.length} need upload`,
)

const stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 }
const BATCH = 20

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  const { data: rows, error } = await supabase
    .from('audio_files')
    .select('id, waveform_data')
    .in('id', batch)
  if (error) {
    console.error(`[waveform-backfill] batch fetch failed: ${error.message}`)
    stats.failed += batch.length
    continue
  }

  for (const row of rows) {
    const peaks = Array.isArray(row.waveform_data) ? row.waveform_data : null
    if (!peaks || peaks.length === 0) {
      stats.skipped += 1
      continue
    }
    try {
      const json = JSON.stringify(peaks)
      if (dryRun) {
        stats.uploaded += 1
        stats.bytes += Buffer.byteLength(json)
        continue
      }
      const jsonUrl = await upload(`waveforms/${row.id}.json`, json, 'application/json')
      const svgUrl = await upload(
        `waveforms/${row.id}.svg`,
        waveformPeaksToSvg(peaks),
        'image/svg+xml',
      )
      const { error: updateError } = await supabase
        .from('audio_files')
        .update({ waveform_json_url: jsonUrl, waveform_svg_url: svgUrl })
        .eq('id', row.id)
      if (updateError) throw new Error(`db update: ${updateError.message}`)
      stats.uploaded += 1
      stats.bytes += Buffer.byteLength(json)
    } catch (err) {
      stats.failed += 1
      console.warn(`[waveform-backfill] FAIL ${row.id}: ${err.message}`)
    }
  }
  console.log(`[waveform-backfill] ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
}

console.log('[waveform-backfill] done', {
  ...stats,
  megabytes: +(stats.bytes / 1024 / 1024).toFixed(2),
})
