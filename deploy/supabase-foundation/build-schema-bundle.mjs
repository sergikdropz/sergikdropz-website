#!/usr/bin/env node
/**
 * Concatenate web/supabase SQL into one file for Supabase Dashboard → SQL Editor.
 * Safe to re-run: base schemas use IF NOT EXISTS where possible.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webSupabase = path.resolve(__dirname, '../../web/supabase')
const outDir = path.join(__dirname, 'out')
const outFile = path.join(outDir, 'schema-bundle.sql')

const BASE_ORDER = [
  'schema.sql',
  'music_library_schema.sql',
  'gallery_images_schema.sql',
  'settings-schema.sql',
  'analytics-schema.sql',
  'activity-logs-schema.sql',
  'studio_schema.sql',
  'admin-setup.sql',
  'database-admin-functions.sql',
]

const migrationsDir = path.join(webSupabase, 'migrations')
const migrationFiles = fs.existsSync(migrationsDir)
  ? fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  : []

const tail = ['storage-policies.sql', 'optimized-views.sql']

const parts = []
for (const name of BASE_ORDER) {
  const p = path.join(webSupabase, name)
  if (fs.existsSync(p)) parts.push({ label: name, path: p })
}
for (const name of migrationFiles) {
  parts.push({ label: `migrations/${name}`, path: path.join(migrationsDir, name) })
}
for (const name of tail) {
  const p = path.join(webSupabase, name)
  if (fs.existsSync(p)) parts.push({ label: name, path: p })
}

fs.mkdirSync(outDir, { recursive: true })
const chunks = [
  '-- SERGIK schema bundle — paste into Supabase Dashboard → SQL Editor',
  `-- Generated ${new Date().toISOString()}`,
  '-- Run once on a NEW empty project. Does not delete existing rows.',
  '',
]
for (const part of parts) {
  chunks.push(`-- ===== ${part.label} =====`)
  chunks.push(fs.readFileSync(part.path, 'utf8'))
  chunks.push('')
}
fs.writeFileSync(outFile, chunks.join('\n'))
const kb = (fs.statSync(outFile).size / 1024).toFixed(1)
console.log(`[schema:bundle] Wrote ${outFile} (${kb} KB, ${parts.length} files)`)
