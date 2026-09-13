import { createJob, getJob, updateJob } from '@/lib/jobs/job-store'
import type { BackgroundJob } from '@/lib/jobs/types'
import { getAudioFileById, updateAudioSonicDnaStatus } from '@/lib/repositories/music'
import { createSupabaseServerClient } from '@/lib/supabase'
import { lockAnalysisForAudioFile } from '@/lib/catalog-lock'
import {
  extractMeasured,
  sonicDnaCompletenessPercent,
  sonicDnaStatusFromMeasured,
} from '@/lib/audio/sonic-dna-quality'
import {
  assessAudioHealth,
  buildWaveformEnvelope,
  enrichSonicDnaV2,
  stageProgress,
  type SonicDnaV2Stage,
} from '@/lib/audio/sonic-dna-v2'
import { ensureMeasuredOnDna } from '@/lib/audio/normalize-agent-to-measured'
import { loadSonicDnaFromKnowledge } from '@/lib/audio/load-local-measured'
import { mergePreferredSonicDna } from '@/lib/audio/sonic-dna-quality'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'
import { runAccuracyChallenge } from '@/lib/audio/sonic-dna-v2/accuracy-challenge'
import { resolveWaveformPeaks } from '@/lib/audio/waveform-peaks-source'
import { persistAudioFileArtifacts } from '@/utils/analysisArtifacts'

async function setJobStage(
  jobId: string,
  stage: SonicDnaV2Stage,
  extra?: { message?: string; dspPercent?: number; dspStatus?: string; completed?: number },
) {
  const progress = stageProgress(stage, {
    message: extra?.message,
    dspPercent: extra?.dspPercent,
    dspStatus: extra?.dspStatus,
  })
  return updateJob(jobId, {
    status: stage === 'failed' ? 'failed' : stage === 'done' ? 'completed' : 'running',
    progress: {
      total: 1,
      completed: extra?.completed ?? (stage === 'done' ? 1 : 0),
      failed: stage === 'failed' ? 1 : 0,
      percent: progress.percent,
      stage: progress.stage,
      label: progress.label,
      message: progress.message,
      recipeId: progress.recipeId,
      dspPercent: progress.dspPercent,
      dspStatus: progress.dspStatus,
    },
  })
}

/**
 * Enqueue an idempotent Sonic DNA analysis job for a track.
 */
export async function enqueueSonicDnaJob(params: {
  adminId: string
  trackId: string
  force?: boolean
  libraryTrackId?: string
  directive?: string
  skipChallenge?: boolean
  proseOnly?: boolean
}): Promise<BackgroundJob> {
  const job = await createJob({
    type: 'sonic_dna_analyze',
    adminId: params.adminId,
    payload: {
      trackId: params.trackId,
      libraryTrackId: params.libraryTrackId || null,
      force: Boolean(params.force),
      directive: params.directive || null,
      // Default: run challenge stage (local accuracy warnings). Pass skipChallenge: true to opt out.
      skipChallenge: Boolean(params.skipChallenge),
      proseOnly: Boolean(params.proseOnly),
    },
    total: 1,
    maxAttempts: 3,
    idempotencySeed: `${params.adminId}:${params.trackId}:${params.force ? 'force' : 'once'}:${Date.now()}`,
  })
  await setJobStage(job.id, 'queued')
  return (await getJob(job.id)) || job
}

/**
 * Run staged Sonic DNA intelligence pipeline:
 * health → waveform → measure (DSP) → normalize → classify → blend/enrich → compose → challenge → publish
 */
export async function runSonicDnaJob(jobId: string): Promise<BackgroundJob | null> {
  const job = await getJob(jobId)
  if (!job) return null
  if (job.status === 'completed') return job
  if (job.attempts >= job.maxAttempts) {
    return updateJob(jobId, { status: 'failed', lastError: 'Max attempts exceeded' })
  }

  await updateJob(jobId, { attempts: job.attempts + 1 })
  const trackId = String(job.payload.trackId || '')
  const force = Boolean(job.payload.force)
  const directive =
    typeof job.payload.directive === 'string' && job.payload.directive.trim()
      ? job.payload.directive.trim()
      : force
        ? 'force regenerate'
        : undefined
  const started = Date.now()
  const supabase = createSupabaseServerClient()

  try {
    const track = await getAudioFileById(trackId)
    if (!track.ok || !track.data) {
      await setJobStage(jobId, 'failed', { message: 'Track not found' })
      return updateJob(jobId, { status: 'failed', lastError: track.ok ? 'Track not found' : track.error })
    }

    const previousDna = track.data.sonic_dna
    await updateAudioSonicDnaStatus({ id: trackId, status: 'processing' })
    await setJobStage(jobId, 'health')

    // —— Waveform stage ——
    await setJobStage(jobId, 'waveform')
    let peaks: number[] = (await resolveWaveformPeaks(track.data)) ?? []
    if ((!peaks.length || force) && (track.data.file_url || track.data.file_path)) {
      try {
        const { generateWaveformFromUrl } = await import('@/lib/audio/generate-waveform-server')
        const generated = await generateWaveformFromUrl(
          track.data.file_url || track.data.file_path || '',
          track.data.file_path || undefined,
        )
        if (generated?.peaks?.length) peaks = generated.peaks
      } catch {
        // Keep existing peaks if generation fails — health gate decides.
      }
    }
    const envelope = buildWaveformEnvelope(peaks)
    const health = assessAudioHealth({
      peaks,
      durationSec: track.data.duration_seconds,
    })
    if (!health.ok && peaks.length === 0) {
      await setJobStage(jobId, 'failed', { message: health.issues.join(' ') || 'Audio health failed' })
      await updateAudioSonicDnaStatus({ id: trackId, status: 'failed' })
      return updateJob(jobId, {
        status: 'failed',
        lastError: health.issues.join(' ') || 'Audio health failed',
      })
    }

    // —— Measure (agent / DSP path) ——
    await setJobStage(jobId, 'measure', { message: health.issues.length ? health.issues.join(' ') : undefined })
    const { generateSonicDNAWithAgents } = await import('@/utils/generateSonicDNAWithAgents')
    let sonicDNA: Record<string, unknown> = (await generateSonicDNAWithAgents(
      track.data.title || track.data.file_name || trackId,
      track.data.artist || 'SERGIK',
      trackId,
      {
        filePath: track.data.file_path || undefined,
        audioFileUrl: track.data.file_url || undefined,
        waveformData: peaks.length ? peaks : undefined,
        waveformSamples: peaks.length || undefined,
        bpm: track.data.bpm ?? undefined,
        key: track.data.key_signature ?? undefined,
        duration: track.data.duration_seconds || 0,
        energyLevel: track.data.energy_level ?? undefined,
      },
      directive,
    )) as Record<string, unknown>

    // —— Normalize agent DNA → measured (unlocks encyclopedia compose / rewrite) ——
    await setJobStage(jobId, 'normalize')
    const localMeasured = loadSonicDnaFromKnowledge({
      trackId,
      filePath: track.data.file_path || track.data.file_url || null,
    })
    if (localMeasured) {
      sonicDNA = (mergePreferredSonicDna(localMeasured, sonicDNA) || sonicDNA) as Record<string, unknown>
    }
    sonicDNA = ensureMeasuredOnDna(sonicDNA)

    await setJobStage(jobId, 'classify', {
      message: 'Genre engine lock + KB slice for polymath peers',
    })
    // ensureMeasuredOnDna already ran classifyMeasuredWithGenreEngine into audioPrimary

    let analysisData: Record<string, unknown> = {
      bpm: extractMeasured(sonicDNA)?.bpm ?? (sonicDNA as any)?.technical?.bpm ?? track.data.bpm ?? null,
      key_signature:
        extractMeasured(sonicDNA)?.key ||
        (sonicDNA as any)?.harmony?.keySignature ||
        (sonicDNA as any)?.technical?.key?.key ||
        track.data.key_signature ||
        null,
      energy_level: (sonicDNA as any)?.technical?.energyLevel ?? track.data.energy_level ?? null,
      danceability: (sonicDNA as any)?.technical?.danceability ?? null,
      waveform_data: peaks.length ? peaks : track.data.waveform_data,
      waveform_samples: peaks.length || track.data.waveform_samples,
      waveform_version: envelope.version,
    }

    const locked = await lockAnalysisForAudioFile(supabase, trackId, sonicDNA, analysisData)
    sonicDNA = ensureMeasuredOnDna(locked.sonicDNA as Record<string, unknown>)
    analysisData = locked.analysisData
    // Catalog lock may raise BPM confidence — re-sync measured BPM fields
    const lockedBpm = Number(analysisData.bpm)
    if (Number.isFinite(lockedBpm) && lockedBpm >= 60) {
      const m = extractMeasured(sonicDNA)
      if (m) {
        sonicDNA = {
          ...sonicDNA,
          measured: {
            ...m,
            bpm: lockedBpm,
            bpmConfidence: Math.max(Number(m.bpmConfidence) || 0, 0.95),
            effectiveBpm: Number(m.effectiveBpm) || lockedBpm,
          },
        }
      }
    }

    await setJobStage(jobId, 'blend')
    sonicDNA = enrichSonicDnaV2(sonicDNA, {
      waveformStats: envelope.stats,
      hasWaveform: peaks.length > 0,
      energy: Number(analysisData.energy_level) || null,
      previousDna,
      runCompose: true,
    })

    const measured = extractMeasured(sonicDNA)
    const status = sonicDnaStatusFromMeasured(measured)
    const dspPercent = sonicDnaCompletenessPercent(status, sonicDNA)

    await setJobStage(jobId, 'compose', { dspPercent, dspStatus: status })
    // Challenge: audit + deterministic patches (genre conflicts, groundedness, bass lock, crate leak).
    if (job.payload.skipChallenge !== true) {
      await setJobStage(jobId, 'challenge', { dspPercent, dspStatus: status })
      const challenged = runAccuracyChallenge(sonicDNA)
      sonicDNA = challenged.dna
      const pipelineV2 =
        sonicDNA.pipelineV2 && typeof sonicDNA.pipelineV2 === 'object'
          ? { ...(sonicDNA.pipelineV2 as Record<string, unknown>) }
          : {}
      sonicDNA = {
        ...sonicDNA,
        pipelineV2: {
          ...pipelineV2,
          accuracyWarnings: challenged.warnings,
          challengePatches: challenged.patches,
          conflictsResolved: challenged.conflictsResolved,
          groundedSections: challenged.groundedSections,
          challengedAt: new Date().toISOString(),
        },
      }
    }

    await setJobStage(jobId, 'publish', { dspPercent, dspStatus: status })
    const metadata = mergeSonicDNAIntoMetadata(track.data.metadata || {}, sonicDNA)

    await supabase
      .from('audio_files')
      .update({
        sonic_dna: sonicDNA,
        sonic_dna_status: status,
        sonic_dna_error: null,
        sonic_dna_analyzed_at: new Date().toISOString(),
        analysis_status: status,
        bpm: analysisData.bpm,
        key_signature: analysisData.key_signature,
        energy_level: analysisData.energy_level,
        danceability: analysisData.danceability,
        waveform_samples: analysisData.waveform_samples,
        waveform_version: analysisData.waveform_version,
        metadata,
      })
      .eq('id', trackId)

    // Peaks go to the audio-analysis bucket, not a TOASTed column on two tables.
    if (peaks.length) {
      await persistAudioFileArtifacts({
        audioFileId: trackId,
        filePath: track.data.file_path || '',
        fileName: track.data.file_name,
        waveformData: peaks,
        existingMetadata: metadata,
        force: true,
      }).catch((err) => {
        console.warn('[sonic-dna-job] waveform artifact persist failed:', err?.message || err)
      })
    }

    // Dual-write library tracks sharing this audio file
    await supabase
      .from('music_library_tracks')
      .update({
        sonic_dna: sonicDNA,
        bpm: analysisData.bpm,
        key_signature: analysisData.key_signature,
        energy_level: analysisData.energy_level,
        danceability: analysisData.danceability,
      })
      .eq('audio_file_id', trackId)

    try {
      const libId =
        typeof job.payload.libraryTrackId === 'string' && job.payload.libraryTrackId
          ? job.payload.libraryTrackId
          : trackId
      await updateSonicDNACache(libId, trackId, sonicDNA, {
        bpm: (analysisData.bpm as number | null) ?? null,
        key_signature: (analysisData.key_signature as string | null) ?? null,
        energy_level: (analysisData.energy_level as number | null) ?? null,
        danceability: (analysisData.danceability as number | null) ?? null,
      })
    } catch {
      // non-fatal
    }

    await setJobStage(jobId, 'done', { dspPercent, dspStatus: status, completed: 1 })
    return updateJob(jobId, {
      status: 'completed',
      costMeta: {
        ...(job.costMeta ?? {}),
        durationMs: (job.costMeta?.durationMs ?? 0) + (Date.now() - started),
        providerCalls: (job.costMeta?.providerCalls ?? 0) + 1,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateAudioSonicDnaStatus({ id: trackId, status: 'failed' }).catch(() => null)
    await setJobStage(jobId, 'failed', { message })
    return updateJob(jobId, {
      status: 'failed',
      lastError: message,
      progress: {
        total: 1,
        completed: 0,
        failed: 1,
        percent: 100,
        stage: 'failed',
        label: 'Failed',
        message,
      },
    })
  }
}
