/**
 * One-track analysis worker for the Mac. Polls Supabase. Does not listen on a port.
 *
 *   cd web && npm run analysis:worker
 *
 * Requires web/.env.local (or the environment) to have the Supabase service role
 * and, when the file lives on R2, the R2 keys. This process sets
 * SERGIK_ANALYSIS_INLINE for itself. Leave that unset on Vercel.
 */
import { readFileSync, existsSync } from 'node:fs'
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

const IDLE_MS = 5000

async function bytesFromStream(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    if (next.value) chunks.push(next.value)
  }
  return Buffer.concat(chunks)
}

async function main() {
  const { createSupabaseServerClient } = await import('../lib/supabase')
  const { claimNextAnalysisJob, finishAnalysisJob } = await import('../lib/audio/analysis-queue')
  const { fetchR2Object } = await import('../lib/audio/r2Media')
  const { runTrackUploadPipeline } = await import('../utils/trackUploadPipeline')

  async function bytesFromRow(row: { file_url?: string | null; file_path?: string | null }): Promise<Buffer> {
    if (row.file_path) {
      const object = await fetchR2Object(row.file_path, { method: 'GET' })
      if (object?.body) return bytesFromStream(object.body as ReadableStream<Uint8Array>)
    }
    if (row.file_url) {
      const response = await fetch(row.file_url)
      if (!response.ok) throw new Error(`download failed (${response.status})`)
      return Buffer.from(await response.arrayBuffer())
    }
    throw new Error('audio file has no file_url or file_path')
  }

  async function runOne(): Promise<boolean> {
    const supabase = createSupabaseServerClient()
    const job = await claimNextAnalysisJob(supabase)
    if (!job) return false
    if (!job.audio_file_id) {
      await finishAnalysisJob(supabase, job, { ok: false, error: 'job has no audio_file_id' })
      return true
    }

    try {
      const { data: row, error } = await supabase
        .from('audio_files')
        .select('id, file_url, file_path, file_name, title, artist')
        .eq('id', job.audio_file_id)
        .maybeSingle()
      if (error || !row) throw new Error(error?.message || 'audio file missing')

      const buffer = await bytesFromRow(row)
      process.env.SERGIK_ANALYSIS_INLINE = '1'
      const result = await runTrackUploadPipeline({
        file: buffer,
        filename: row.file_name || 'track.wav',
        title: row.title || undefined,
        artist: row.artist || undefined,
        existingAudioFileId: row.id,
      })
      if (!result.success) throw new Error(result.error || 'analysis failed')
      await finishAnalysisJob(supabase, job, { ok: true })
      console.log(`[analysis-worker] done ${row.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'analysis failed'
      console.warn(`[analysis-worker] ${job.id}: ${message}`)
      await finishAnalysisJob(supabase, job, { ok: false, error: message })
    }
    return true
  }

  console.log('[analysis-worker] polling audio_analysis_jobs (one track at a time)')
  for (;;) {
    const worked = await runOne().catch((err) => {
      console.warn('[analysis-worker]', err instanceof Error ? err.message : err)
      return false
    })
    if (!worked) await new Promise((resolve) => setTimeout(resolve, IDLE_MS))
  }
}

main()
