#!/usr/bin/env node
/**
 * Restore waveforms + sonic DNA from audio_files onto library tracks,
 * copy analysis onto duplicate audio rows, and mark stored DNA as completed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const homeRoot = path.join(__dirname, '..')
const sqlPath = path.join(homeRoot, 'db/init/03-restore-analysis.sql')

function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

const env = loadEnv(path.join(homeRoot, '.env'))
const dbName = env.POSTGRES_DB || 'sergik'
const dbUser = env.POSTGRES_USER || 'postgres'
const sql = fs.readFileSync(sqlPath, 'utf8')

console.log('[restore-analysis] applying SQL on home-server Postgres')
const result = spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'db', 'psql', '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1'],
  { cwd: homeRoot, input: sql, encoding: 'utf8' },
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || result.error)
  process.exit(result.status || 1)
}

const counts = spawnSync(
  'docker',
  [
    'compose', 'exec', '-T', 'db', 'psql', '-U', dbUser, '-d', dbName, '-c',
    `SELECT
       (SELECT count(*) FROM audio_files) AS audio_files,
       (SELECT count(*) FROM audio_files WHERE sonic_dna ? 'genres') AS audio_with_dna,
       (SELECT count(*) FROM audio_files WHERE waveform_data IS NOT NULL) AS audio_with_wf,
       (SELECT count(*) FROM audio_files WHERE sonic_dna_status = 'completed') AS audio_dna_completed,
       (SELECT count(*) FROM music_library_tracks WHERE audio_file_id IS NOT NULL) AS tracks_linked,
       (SELECT count(*) FROM music_library_tracks WHERE sonic_dna ? 'genres') AS tracks_with_dna,
       (SELECT count(*) FROM music_library_tracks WHERE waveform IS NOT NULL) AS tracks_with_wf;
    `,
  ],
  { cwd: homeRoot, encoding: 'utf8' },
)
process.stdout.write(counts.stdout || '')
if (counts.status !== 0) {
  console.error(counts.stderr || 'count query failed')
  process.exit(counts.status || 1)
}

spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'db', 'psql', '-U', dbUser, '-d', dbName, '-c', "NOTIFY pgrst, 'reload schema';"],
  { cwd: homeRoot, encoding: 'utf8' },
)
console.log('[restore-analysis] done')
