/**
 * Extract metadata from audio file buffer
 * Works during upload - no need to wait for file to be saved
 */

import { parseBuffer } from 'music-metadata'
import type { IAudioMetadata } from 'music-metadata'

export interface BufferMetadata {
  title?: string
  artist?: string
  duration?: number
  format?: string
  key?: string
  bpm?: number
  sampleRate?: number
  bitrate?: number
  year?: number
  date?: string
}

/**
 * Extract metadata from audio file buffer
 */
export async function extractMetadataFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<BufferMetadata> {
  try {
    const metadata = await parseBuffer(buffer)
    const { originalDateFromEmbeddedTags } = await import('@/lib/audio/original-file-date')
    const original = originalDateFromEmbeddedTags(metadata.common as any)

    return {
      title: metadata.common.title || fileName.replace(/\.[^/.]+$/, ''),
      artist: metadata.common.artist || 'SERGIK',
      duration: metadata.format.duration ? Math.round(metadata.format.duration) : undefined,
      format: metadata.format.container?.toUpperCase() || fileName.split('.').pop()?.toUpperCase() || 'MP3',
      key: metadata.common.key?.[0] || undefined,
      sampleRate: metadata.format.sampleRate,
      bitrate: metadata.format.bitrate,
      year: original?.year,
      date: original?.isoDate,
    }
  } catch (error: any) {
    console.warn(`[Metadata] Failed to extract from buffer: ${error.message}`)
    // Return basic metadata from filename
    return {
      title: fileName.replace(/\.[^/.]+$/, ''),
      artist: 'SERGIK',
      format: fileName.split('.').pop()?.toUpperCase() || 'MP3'
    }
  }
}

