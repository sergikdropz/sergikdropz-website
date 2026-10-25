import { createSupabaseServerClient } from '@/lib/supabase'
import {
  ANALYSIS_MAX_ATTEMPTS,
  ANALYZER_VERSION,
  analysisRowComplete,
  decideJobAttach,
  hashAudioBytes,
  type AnalysisJobRow,
} from '@/lib/audio/analysis-job'

type Supabase = ReturnType<typeof createSupabaseServerClient>

const COMPLETE_SELECT =
  'id, title, artist, file_url, file_hash, analyzer_version, waveform_json_url, bpm, key_signature, energy_level, danceability, duration_seconds, sonic_dna, sonic_dna_status'

export async function findCompletedAnalysis(supabase: Supabase, fileHash: string) {
  const { data, error } = await supabase
    .from('audio_files')
    .select(COMPLETE_SELECT)
    .eq('file_hash', fileHash)
    .eq('analyzer_version', ANALYZER_VERSION)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[analysis] lookup failed:', error.message)
    return null
  }
  return analysisRowComplete(data) ? data : null
}

async function findJob(
  supabase: Supabase,
  match: { fileHash?: string | null; audioFileId?: string | null },
): Promise<AnalysisJobRow | null> {
  let query = supabase.from('audio_analysis_jobs').select('*').eq('analyzer_version', ANALYZER_VERSION)
  if (match.fileHash) query = query.eq('file_hash', match.fileHash)
  else if (match.audioFileId) query = query.eq('audio_file_id', match.audioFileId)
  else return null
  const { data } = await query.maybeSingle()
  return (data as AnalysisJobRow | null) ?? null
}

export async function enqueueAnalysisJob(
  supabase: Supabase,
  input: { fileHash?: string | null; audioFileId?: string | null },
): Promise<{ job: AnalysisJobRow | null; exhausted: boolean }> {
  const existing = await findJob(supabase, input)
  const action = decideJobAttach(existing)
  const now = new Date().toISOString()

  if (action === 'exhausted') return { job: existing, exhausted: true }
  if (action === 'attach') return { job: existing, exhausted: false }
  if (action === 'requeue' && existing) {
    const { data } = await supabase
      .from('audio_analysis_jobs')
      .update({ status: 'pending', last_error: null, updated_at: now })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle()
    return { job: (data as AnalysisJobRow | null) ?? existing, exhausted: false }
  }

  const { data, error } = await supabase
    .from('audio_analysis_jobs')
    .insert({
      file_hash: input.fileHash ?? null,
      analyzer_version: ANALYZER_VERSION,
      audio_file_id: input.audioFileId ?? null,
      status: 'pending',
      attempts: 0,
      max_attempts: ANALYSIS_MAX_ATTEMPTS,
    })
    .select('*')
    .maybeSingle()

  if (error) {
    const raced = await findJob(supabase, input)
    if (raced) return { job: raced, exhausted: decideJobAttach(raced) === 'exhausted' }
    throw new Error(error.message)
  }
  return { job: data as AnalysisJobRow | null, exhausted: false }
}

export async function claimNextAnalysisJob(supabase: Supabase): Promise<AnalysisJobRow | null> {
  const { data: rows } = await supabase
    .from('audio_analysis_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
  const job = (rows?.[0] as AnalysisJobRow | undefined) ?? null
  if (!job) return null
  const cap = job.max_attempts ?? ANALYSIS_MAX_ATTEMPTS
  if (job.attempts >= cap) {
    await supabase
      .from('audio_analysis_jobs')
      .update({
        status: 'failed',
        last_error: 'retry cap reached',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending')
    return null
  }
  const { data: claimed } = await supabase
    .from('audio_analysis_jobs')
    .update({
      status: 'running',
      attempts: job.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  return (claimed as AnalysisJobRow | null) ?? null
}

export async function finishAnalysisJob(
  supabase: Supabase,
  job: AnalysisJobRow,
  result: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const now = new Date().toISOString()
  if (result.ok) {
    await supabase
      .from('audio_analysis_jobs')
      .update({ status: 'done', last_error: null, updated_at: now })
      .eq('id', job.id)
    return
  }
  const cap = job.max_attempts ?? ANALYSIS_MAX_ATTEMPTS
  const attempts = job.attempts
  await supabase
    .from('audio_analysis_jobs')
    .update({
      status: attempts >= cap ? 'failed' : 'pending',
      last_error: result.error.slice(0, 500),
      updated_at: now,
    })
    .eq('id', job.id)
}

/** Store the bytes and a pending job. Does not decode. */
export async function enqueueUploadWithoutDecode(input: {
  buffer: Buffer
  filename: string
  title: string
  artist: string
  folderId?: string
  existingAudioFileId?: string
}): Promise<{
  success: boolean
  queued?: boolean
  exhausted?: boolean
  reused?: boolean
  audioFileId?: string
  jobId?: string
  error?: string
  data?: {
    title: string
    artist: string
    bpm: number | null
    keySignature: string | null
    energyLevel: number | null
    danceability: number | null
    duration: number | null
    genres: string[]
    sonicDna: unknown
    waveform: unknown
  }
}> {
  const supabase = createSupabaseServerClient()
  const fileHash = input.buffer.length > 0 ? hashAudioBytes(input.buffer) : null

  if (fileHash) {
    const reused = await findCompletedAnalysis(supabase, fileHash)
    if (reused) {
      return {
        success: true,
        reused: true,
        audioFileId: reused.id,
        data: {
          title: reused.title,
          artist: reused.artist,
          bpm: reused.bpm,
          keySignature: reused.key_signature,
          energyLevel: reused.energy_level,
          danceability: reused.danceability,
          duration: reused.duration_seconds,
          genres: [],
          sonicDna: reused.sonic_dna,
          waveform: null,
        },
      }
    }
  }

  let audioFileId = input.existingAudioFileId
  if (!audioFileId) {
    if (!fileHash) return { success: false, error: 'No audio bytes to hash' }
    const fileName = `${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('audio-files').upload(fileName, input.buffer, {
      contentType: 'audio/wav',
      upsert: false,
    })
    if (uploadError) return { success: false, error: uploadError.message }
    const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(fileName)
    const { data: audioFile, error: audioError } = await supabase
      .from('audio_files')
      .insert({
        title: input.title,
        artist: input.artist,
        file_name: input.filename,
        file_url: urlData?.publicUrl || '',
        format: 'wav',
        size_bytes: input.buffer.length,
        file_hash: fileHash,
        analyzer_version: ANALYZER_VERSION,
        sonic_dna_status: 'pending',
      })
      .select('id')
      .single()
    if (audioError || !audioFile) return { success: false, error: audioError?.message || 'Audio row failed' }
    audioFileId = audioFile.id
  } else if (fileHash) {
    await supabase
      .from('audio_files')
      .update({ file_hash: fileHash, analyzer_version: ANALYZER_VERSION, sonic_dna_status: 'pending' })
      .eq('id', audioFileId)
  }

  const { job, exhausted } = await enqueueAnalysisJob(supabase, { fileHash, audioFileId })
  if (exhausted) {
    return { success: false, exhausted: true, audioFileId, error: 'Analysis retry cap reached for this file' }
  }
  return {
    success: true,
    queued: true,
    audioFileId,
    jobId: job?.id,
    data: {
      title: input.title,
      artist: input.artist,
      bpm: null,
      keySignature: null,
      energyLevel: null,
      danceability: null,
      duration: null,
      genres: [],
      sonicDna: null,
      waveform: null,
    },
  }
}
