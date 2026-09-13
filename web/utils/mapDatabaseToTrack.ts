/**
 * Utility to map Supabase audio_files database records to Track interface
 * Ensures all analysis data is properly integrated for music playback
 */

import { Track } from '@/contexts/MusicPlayerContext'

export interface AudioFileRecord {
  id: string
  title: string
  artist: string
  duration_seconds?: number
  file_url?: string
  file_path?: string
  artwork_url?: string
  folder_path?: string
  // Audio analysis fields
  bpm?: number | null
  original_bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
  frequency_bands?: any
  waveform_data?: number[] | null
  // Sonic DNA analysis
  sonic_dna?: any
  musicbrainz_id?: string | null
  musicbrainz_data?: any
  // Metadata
  metadata?: any
}

/**
 * Map a Supabase audio_files record to a Track object
 * @param record - Database record from audio_files table
 * @returns Track object ready for music player
 */
export function mapDatabaseToTrack(record: AudioFileRecord): Track {
  return {
    id: record.id,
    title: record.title,
    artist: record.artist || 'Unknown',
    duration: record.duration_seconds || 0,
    file: record.file_url || record.file_path || '',
    artwork: record.artwork_url || undefined,
    folder: record.folder_path || undefined,
    // Audio analysis fields
    bpm: record.bpm ?? undefined,
    key_signature: record.key_signature || undefined,
    energy_level: record.energy_level ?? undefined,
    danceability: record.danceability ?? undefined,
    frequency_bands: record.frequency_bands || undefined,
    waveform_data: record.waveform_data || undefined,
    // Sonic DNA analysis
    sonic_dna: record.sonic_dna || undefined,
    musicbrainz_id: record.musicbrainz_id || undefined,
    musicbrainz_data: record.musicbrainz_data || undefined,
  }
}

/**
 * Map multiple database records to Track objects
 * @param records - Array of database records
 * @returns Array of Track objects
 */
export function mapDatabaseToTracks(records: AudioFileRecord[]): Track[] {
  return records.map(mapDatabaseToTrack)
}

