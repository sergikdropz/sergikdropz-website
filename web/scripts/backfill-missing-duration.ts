/**
 * Fill blank Time-column lengths from the audio file itself.
 * Reads the file header only. Does not re-analyze Sonic DNA.
 *
 *   cd web && npx tsx scripts/backfill-missing-duration.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function loadEnvFile(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'))
loadEnvFile(path.join(process.cwd(), '..', 'web', '.env.local'))

type TrackRow = {
  id: string
  title: string | null
  duration: number | null
  audio_file_id: string | null
  file_url: string | null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[duration] Missing Supabase URL or service role')
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { probeAudioDurationSec } = await import('../lib/studio/catalog-timestamp-probe')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, duration, audio_file_id, file_url')
    .or('is_archived.is.null,is_archived.eq.false')
    .limit(1000)
  if (error) throw new Error(error.message)

  const missing = ((data || []) as TrackRow[]).filter((row) => !(Number(row.duration) > 0))
  console.log(`[duration] ${missing.length} tracks missing a length`)

  let filled = 0
  let failed = 0
  for (const row of missing) {
    const seconds = await probeAudioDurationSec(row.file_url)
    if (seconds == null) {
      failed += 1
      console.log(`[duration] miss ${row.title || row.id}`)
      continue
    }
    const { error: trackError } = await supabase
      .from('music_library_tracks')
      .update({ duration: seconds })
      .eq('id', row.id)
    if (trackError) throw new Error(trackError.message)
    if (row.audio_file_id) {
      const { error: audioError } = await supabase
        .from('audio_files')
        .update({ duration_seconds: seconds })
        .eq('id', row.audio_file_id)
      if (audioError) throw new Error(audioError.message)
    }
    filled += 1
    const m = Math.floor(seconds / 60)
    const s = String(seconds % 60).padStart(2, '0')
    console.log(`[duration] ${m}:${s} ${row.title || row.id}`)
  }

  console.log(`[duration] filled ${filled}, still missing ${failed}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
