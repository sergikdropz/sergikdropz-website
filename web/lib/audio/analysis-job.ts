import { createHash } from 'node:crypto'

/** Bump when the decoder or Sonic DNA writer changes. Old rows re-queue. */
export const ANALYZER_VERSION = 'sonic-dna-2026-10'
export const ANALYSIS_MAX_ATTEMPTS = 3

export type AnalysisJobStatus = 'pending' | 'running' | 'done' | 'failed'

export type AnalysisJobRow = {
  id: string
  file_hash: string | null
  analyzer_version: string
  audio_file_id: string | null
  status: AnalysisJobStatus
  attempts: number
  max_attempts: number
  last_error: string | null
}

export function hashAudioBytes(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function analysisRowComplete(row: {
  file_hash?: string | null
  analyzer_version?: string | null
  waveform_json_url?: string | null
  bpm?: number | null
  sonic_dna?: unknown
  sonic_dna_status?: string | null
} | null): boolean {
  if (!row?.file_hash) return false
  if (row.analyzer_version !== ANALYZER_VERSION) return false
  if (!row.waveform_json_url) return false
  if (row.bpm == null) return false
  if (row.sonic_dna == null) return false
  return row.sonic_dna_status === 'completed'
}

export type JobAttachAction = 'insert' | 'attach' | 'requeue' | 'exhausted'

/** A second click joins the open job. Failures retry until the cap, then stop. */
export function decideJobAttach(
  job: { status: string; attempts: number; max_attempts?: number | null } | null,
): JobAttachAction {
  if (!job) return 'insert'
  const cap = job.max_attempts ?? ANALYSIS_MAX_ATTEMPTS
  if (job.status === 'failed') {
    return job.attempts >= cap ? 'exhausted' : 'requeue'
  }
  if (job.attempts >= cap && job.status !== 'done' && job.status !== 'running' && job.status !== 'pending') {
    return 'exhausted'
  }
  return 'attach'
}
