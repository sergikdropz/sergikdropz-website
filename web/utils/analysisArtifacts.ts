import { createSupabaseServerClient } from '@/lib/supabase'

const ANALYSIS_BUCKET = 'audio-analysis'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function waveformPeaksToSvg(peaks: number[], width = 1200, height = 240): string {
  const safeWidth = Math.max(200, Math.floor(width))
  const safeHeight = Math.max(80, Math.floor(height))

  const midY = safeHeight / 2
  const maxAbs = peaks.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0) || 1

  // Render as vertical bars for each peak; fast + compact.
  const barWidth = safeWidth / Math.max(1, peaks.length)
  const bars = peaks
    .map((p, i) => {
      const v = clamp((Number(p) || 0) / maxAbs, -1, 1)
      const barH = Math.max(1, Math.abs(v) * midY)
      const x = i * barWidth
      const y = v >= 0 ? midY - barH : midY
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0.5, barWidth * 0.9).toFixed(
        2,
      )}" height="${barH.toFixed(2)}" rx="0.5" ry="0.5" />`
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

export function extractSonicDnaSummary(sonicDna: any): Record<string, any> {
  if (!sonicDna || typeof sonicDna !== 'object') return {}

  // Best-effort: these keys exist in many of your agent outputs, but we keep it defensive.
  const primaryGenre =
    sonicDna?.genres?.primaryGenres?.[0] ||
    sonicDna?.genres?.primary_genres?.[0] ||
    sonicDna?.comprehensive?.genres?.primaryGenres?.[0] ||
    null

  const moods =
    sonicDna?.emotional?.primaryEmotions ||
    sonicDna?.emotional?.moods ||
    sonicDna?.comprehensive?.emotional?.primaryEmotions ||
    null

  const description =
    sonicDna?.summary ||
    sonicDna?.description ||
    sonicDna?.comprehensive?.summary ||
    sonicDna?.comprehensive?.description ||
    null

  const intention = sonicDna?.intention || sonicDna?.comprehensive?.intention || null

  return {
    sonic_dna_primary_genre: primaryGenre,
    sonic_dna_moods: Array.isArray(moods) ? moods.slice(0, 8) : moods,
    sonic_dna_description: typeof description === 'string' ? description : null,
    sonic_dna_intention: typeof intention === 'string' ? intention : null,
  }
}

async function ensureAnalysisBucketExists() {
  const supabase = createSupabaseServerClient()
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === ANALYSIS_BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(ANALYSIS_BUCKET, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['image/svg+xml', 'application/json', 'text/plain'],
    })
  }
}

async function uploadText(
  bucket: string,
  path: string,
  content: string,
  contentType: string,
): Promise<string> {
  const supabase = createSupabaseServerClient()
  const buffer = Buffer.from(content, 'utf-8')

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function persistAudioFileArtifacts(params: {
  audioFileId: string
  filePath: string
  fileName?: string | null
  waveformData?: number[] | null
  sonicDna?: any
  existingMetadata?: any
  force?: boolean
}): Promise<{
  waveform_svg_url?: string
  waveform_json_url?: string
  sonic_dna_json_url?: string
  metadataPatch: Record<string, any>
}> {
  const supabase = createSupabaseServerClient()
  await ensureAnalysisBucketExists()

  const {
    audioFileId,
    filePath,
    waveformData,
    sonicDna,
    existingMetadata,
    force = false,
  } = params

  const baseKey = audioFileId || filePath.replace(/[^\w\-/.]+/g, '_')
  const safeBase = baseKey.replace(/^\/+/, '')

  const metadataPatch: Record<string, any> = {
    analysis_artifacts: {
      ...(existingMetadata?.analysis_artifacts || {}),
    },
    ...extractSonicDnaSummary(sonicDna),
  }

  let waveform_svg_url: string | undefined
  let waveform_json_url: string | undefined
  let sonic_dna_json_url: string | undefined

  // Waveform artifacts
  if (Array.isArray(waveformData) && waveformData.length > 0) {
    const svgPath = `waveforms/${safeBase}.svg`
    const jsonPath = `waveforms/${safeBase}.json`
    const svg = waveformPeaksToSvg(waveformData)
    const json = JSON.stringify(waveformData)

    if (force || !existingMetadata?.analysis_artifacts?.waveform_svg_url) {
      waveform_svg_url = await uploadText(ANALYSIS_BUCKET, svgPath, svg, 'image/svg+xml')
      metadataPatch.analysis_artifacts.waveform_svg_url = waveform_svg_url
    }
    if (force || !existingMetadata?.analysis_artifacts?.waveform_json_url) {
      waveform_json_url = await uploadText(ANALYSIS_BUCKET, jsonPath, json, 'application/json')
      metadataPatch.analysis_artifacts.waveform_json_url = waveform_json_url
    }
  }

  // Sonic DNA artifact
  if (sonicDna) {
    const dnaPath = `sonic-dna/${safeBase}.json`
    const dnaJson = JSON.stringify(sonicDna)

    if (force || !existingMetadata?.analysis_artifacts?.sonic_dna_json_url) {
      sonic_dna_json_url = await uploadText(ANALYSIS_BUCKET, dnaPath, dnaJson, 'application/json')
      metadataPatch.analysis_artifacts.sonic_dna_json_url = sonic_dna_json_url
    }
  }

  // Persist the artifact URLs to the DB columns too (easy to query; avoids JSON parsing)
  const updatePayload: any = {}
  if (waveform_svg_url) updatePayload.waveform_svg_url = waveform_svg_url
  if (waveform_json_url) updatePayload.waveform_json_url = waveform_json_url
  if (sonic_dna_json_url) updatePayload.sonic_dna_json_url = sonic_dna_json_url

  // Merge metadata patch into metadata JSONB
  const nextMetadata =
    typeof existingMetadata === 'object' && existingMetadata !== null
      ? { ...existingMetadata, ...metadataPatch, analysis_artifacts: metadataPatch.analysis_artifacts }
      : metadataPatch

  updatePayload.metadata = nextMetadata

  await supabase.from('audio_files').update(updatePayload).eq('id', audioFileId)

  return { waveform_svg_url, waveform_json_url, sonic_dna_json_url, metadataPatch }
}

