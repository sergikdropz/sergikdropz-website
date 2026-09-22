import { createHash } from 'crypto'
import { extractMetadataFromBuffer } from '@/utils/extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from '@/utils/generateWaveformFromBuffer'
import { processUploadOptimized } from '@/utils/processUploadOptimized'

export const MAX_MASTER_WAV_BYTES = 250 * 1024 * 1024

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>
      getPublicUrl: (path: string) => { data: { publicUrl: string } }
    }
  }
  from: (table: string) => any
}

export function isWavMasterFile(name: string, type?: string | null): boolean {
  if (/\.wav$/i.test(name.trim())) return true
  return /audio\/(wav|x-wav|wave)/i.test(String(type || ''))
}

export function wavMasterError(file: { name?: string; type?: string; size?: number }): string | null {
  const name = String(file.name || '')
  const size = Number(file.size) || 0
  if (!name && !file.type) return 'Choose a WAV file.'
  if (!isWavMasterFile(name, file.type)) return 'Master must be a WAV file.'
  if (size <= 0) return 'File is empty.'
  if (size > MAX_MASTER_WAV_BYTES) return 'WAV is over 250MB.'
  return null
}

export function safeAudioFileName(fileName: string, fallback = 'master.wav'): string {
  const base = fileName.split(/[/\\]/).pop() || fallback
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

export function vaultReplaceDestPath(
  existingPath: string | null | undefined,
  audioFileId: string,
  fileName: string,
): string {
  const safe = safeAudioFileName(fileName)
  const current = String(existingPath || '').replace(/^\/+/, '')
  const dir = current.includes('/')
    ? current.slice(0, current.lastIndexOf('/'))
    : `replacements/${audioFileId}`
  return `${dir}/${safe}`
}

export function cacheBustMediaUrl(url: string, version = Date.now()): string {
  const [withoutHash, hash] = url.split('#')
  const cleaned = withoutHash.replace(/([?&])v=\d+/g, '$1').replace(/[?&]$/, '')
  const joiner = cleaned.includes('?') ? '&' : '?'
  return `${cleaned}${joiner}v=${version}${hash ? `#${hash}` : ''}`
}

export function fingerprintHashFromBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function replaceLibraryAudioFile(
  supabase: StorageClient,
  opts: {
    audioFileId: string
    libraryTrackId?: string | null
    fileName: string
    mimeType?: string | null
    fileSize: number
    buffer: Buffer
  },
): Promise<{ fileUrl: string; filePath: string; duration: number | null }> {
  const { data: audioFile, error: audioError } = await supabase
    .from('audio_files')
    .select('id, file_path, file_url, file_name, artist, title')
    .eq('id', opts.audioFileId)
    .single()

  if (audioError || !audioFile) {
    throw new Error(audioError?.message || 'Audio file not found')
  }

  const fileName = safeAudioFileName(opts.fileName, String(audioFile.file_name || 'audio.wav'))
  const ext = (fileName.split('.').pop() || 'wav').toUpperCase()
  const filePath = vaultReplaceDestPath(String(audioFile.file_path || ''), opts.audioFileId, fileName)
  const contentType = opts.mimeType || (ext === 'WAV' ? 'audio/wav' : 'audio/mpeg')

  const { error: uploadError } = await supabase.storage.from('audio-files').upload(filePath, opts.buffer, {
    contentType,
    upsert: true,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(filePath)
  const fileUrl = cacheBustMediaUrl(urlData.publicUrl)
  const metadata = await extractMetadataFromBuffer(opts.buffer, fileName)
  const waveform = await generateWaveformFromBuffer(opts.buffer, fileName)
  const duration = metadata.duration != null ? Math.round(metadata.duration) : null

  const { error: updateError } = await supabase
    .from('audio_files')
    .update({
      file_name: fileName,
      file_path: filePath,
      file_url: fileUrl,
      format: ext,
      size_bytes: opts.fileSize,
      size_mb: parseFloat((opts.fileSize / (1024 * 1024)).toFixed(2)),
      duration_seconds: duration,
      key_signature: metadata.key || null,
      waveform_data: waveform?.data || null,
      waveform_samples: waveform?.samples || null,
      sonic_dna_status: 'pending',
      sonic_dna_error: null,
    })
    .eq('id', opts.audioFileId)

  if (updateError) throw new Error(updateError.message)

  const libraryPatch: Record<string, unknown> = { file_url: fileUrl }
  if (duration != null) libraryPatch.duration = duration

  await supabase.from('music_library_tracks').update(libraryPatch).eq('audio_file_id', opts.audioFileId)
  if (opts.libraryTrackId) {
    await supabase.from('music_library_tracks').update(libraryPatch).eq('id', opts.libraryTrackId)
  }

  processUploadOptimized(opts.audioFileId, opts.buffer, fileName, fileUrl, filePath, {
    metadata,
    waveform,
    musicbrainz: null,
  })

  return { fileUrl, filePath, duration }
}

export async function uploadStudioMasterWav(
  supabase: StorageClient,
  opts: { trackId: string; fileName: string; buffer: Buffer },
): Promise<{ fileUrl: string; filePath: string }> {
  const fileName = safeAudioFileName(opts.fileName)
  const filePath = `studio/wav/${opts.trackId}-${Date.now()}-${fileName}`
  const { error } = await supabase.storage.from('audio-files').upload(filePath, opts.buffer, {
    contentType: 'audio/wav',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('audio-files').getPublicUrl(filePath)
  return { fileUrl: cacheBustMediaUrl(data.publicUrl), filePath }
}
