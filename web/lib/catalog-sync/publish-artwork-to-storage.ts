import { readFile } from 'fs/promises'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

const AUDIO_BUCKET = 'audio-files'

export function mimeForArtworkFile(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'avif') return 'image/avif'
  return 'image/jpeg'
}

/** Public Storage URL for a folder/track cover in the audio-files bucket. */
export function publicArtworkStorageUrl(supabase: SupabaseClient, fileName: string): string {
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(`artwork/${fileName}`).data.publicUrl
}

export async function uploadArtworkBuffer(
  supabase: SupabaseClient,
  fileName: string,
  buffer: Buffer,
  mimeType = mimeForArtworkFile(fileName),
): Promise<string> {
  const path = `artwork/${fileName}`
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  })
  if (error) throw new Error(error.message || 'Cover art storage upload failed')
  return publicArtworkStorageUrl(supabase, fileName)
}

export async function uploadLocalArtworkFile(
  supabase: SupabaseClient,
  fileName: string,
  artworkDir = join(process.cwd(), 'public', 'images', 'audio', 'artwork'),
): Promise<string> {
  const buffer = await readFile(join(artworkDir, fileName))
  return uploadArtworkBuffer(supabase, fileName, buffer)
}
