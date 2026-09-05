#!/usr/bin/env node
/**
 * Local CLI: compare `audio_files` to `audio-files` bucket (same behavior as GET /api/admin/storage-audio-audit).
 * Uses service role from .env.local — keep aligned with web/lib/audioStorageAudit.ts
 *
 * Usage:
 *   node scripts/audit-audio-storage.mjs
 *   node scripts/audit-audio-storage.mjs --limit=50 --offset=0
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
dotenv.config({ path: resolve(webRoot, '.env') })
dotenv.config({ path: resolve(webRoot, '.env.local') })

const BUCKET = 'audio-files'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in web/.env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const limit = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '100', 10) || 100
const offset = parseInt(args.find((a) => a.startsWith('--offset='))?.split('=')[1] || '0', 10) || 0

function extractPathFromSupabaseUrl(url) {
  if (!url || !url.startsWith('http')) return null
  const m = String(url).match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  try {
    return decodeURIComponent(m[2].split('?')[0])
  } catch {
    return m[2].split('?')[0]
  }
}

function normalizeKey(input) {
  if (!input || typeof input !== 'string') return ''
  let s = input.trim()
  if (s.startsWith('http')) {
    const e = extractPathFromSupabaseUrl(s)
    if (e) s = e
  }
  s = s
    .replace(/^\/audio\//i, '')
    .replace(/^\//, '')
    .replace(/\\/g, '/')
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s)
  } catch {
    // ignore
  }
  return s.replace(/^\/+|\/+$/g, '')
}

function candidatesFor(raw) {
  const a = normalizeKey(raw)
  const b = normalizeKey(
    (() => {
      try {
        return decodeURIComponent(String(raw).trim())
      } catch {
        return raw
      }
    })(),
  )
  const c = a.replace(/\.wav(?=$|[?#])/i, '.mp3')
  const d = b.replace(/\.wav(?=$|[?#])/i, '.mp3')
  const out = []
  const push = (x) => {
    if (x && !out.includes(x)) out.push(x)
  }
  push(a)
  if (b !== a) push(b)
  if (c !== a) push(c)
  if (d !== b && d !== a && d !== c) push(d)
  return out.length ? out : a ? [a] : []
}

function rowKey(row) {
  if (row.file_path?.trim()) return normalizeKey(row.file_path)
  if (row.file_url?.trim()) {
    return normalizeKey(extractPathFromSupabaseUrl(row.file_url) || row.file_url)
  }
  return ''
}

async function existsInStorage(pathOrKey) {
  const c = candidatesFor(pathOrKey)
  if (!c.length) return { ok: false, listErr: undefined }
  let listErr
  for (const k of c) {
    const parts = k.split('/').filter(Boolean)
    const name = parts.pop() || ''
    if (!name) continue
    const folder = parts.join('/')
    const { data, error } = await supabase.storage.from(BUCKET).list(folder || '', { search: name, limit: 50 })
    if (error) {
      listErr = error.message
      continue
    }
    if ((data || []).some((f) => f.name === name)) {
      return { ok: true, matchedKey: k }
    }
  }
  return { ok: false, listErr }
}

const { data: rows, error: le } = await supabase
  .from('audio_files')
  .select('id, file_path, file_name, file_url, title, artist')
  .order('id', { ascending: true })
  .range(offset, offset + limit - 1)

if (le) {
  console.error('Query error:', le.message)
  process.exit(1)
}

let ok = 0
const missing = []
const listErrs = []
const skipped = []

for (const row of rows || []) {
  const k = rowKey(row)
  if (!k) {
    skipped.push(row.id)
    continue
  }
  const r = await existsInStorage(k)
  if (r.ok) {
    ok++
  } else if (r.listErr) {
    listErrs.push({ id: row.id, key: k, err: r.listErr })
  } else {
    missing.push({ id: row.id, key: k, title: row.title, file_path: row.file_path })
  }
}

console.log(JSON.stringify({ offset, limit, scanned: (rows || []).length, ok, missingCount: missing.length, listErrors: listErrs.length, skipped: skipped.length }, null, 2))
if (missing.length) {
  console.log('\nMissing in storage:')
  console.log(missing.slice(0, 30))
  if (missing.length > 30) console.log(`... and ${missing.length - 30} more`)
}
if (listErrs.length) {
  console.log('\nStorage list errors:')
  console.log(listErrs.slice(0, 20))
}
if (skipped.length) {
  console.log(`\nSkipped (no path): ${skipped.length} ids`)
}
