/**
 * Utility to deduplicate tracks by audio_file_id
 * Same track can appear in multiple folders/playlists
 * This returns TRUE unique track count
 */

export interface TrackWithAudioFileId {
  id: string
  audio_file_id?: string | null
  [key: string]: any
}

export interface DeduplicationResult<T> {
  uniqueTracks: T[]
  totalEntries: number
  duplicateCount: number
}

/**
 * Deduplicate tracks by audio_file_id
 * Tracks with the same audio_file_id are considered duplicates
 * Tracks without audio_file_id are counted separately (by id)
 */
export function deduplicateTracks<T extends TrackWithAudioFileId>(
  tracks: T[]
): DeduplicationResult<T> {
  const uniqueByAudioFile = new Map<string, T>()
  const tracksWithoutAudioFile: T[] = []

  for (const track of tracks) {
    if (track.audio_file_id) {
      // Only keep one entry per unique audio file
      if (!uniqueByAudioFile.has(track.audio_file_id)) {
        uniqueByAudioFile.set(track.audio_file_id, track)
      }
    } else {
      // Tracks without audio_file_id - dedupe by id
      tracksWithoutAudioFile.push(track)
    }
  }

  const uniqueTracks = [...Array.from(uniqueByAudioFile.values()), ...tracksWithoutAudioFile]

  return {
    uniqueTracks,
    totalEntries: tracks.length,
    duplicateCount: tracks.length - uniqueTracks.length
  }
}

/**
 * Get unique track count from tracks array
 */
export function getUniqueTrackCount<T extends TrackWithAudioFileId>(tracks: T[]): number {
  return deduplicateTracks(tracks).uniqueTracks.length
}

/**
 * Calculate stats for unique tracks only
 */
export function calculateUniqueStats<T extends TrackWithAudioFileId>(
  tracks: T[],
  getProperty: (track: T) => boolean
): { count: number; total: number; percent: number } {
  const { uniqueTracks } = deduplicateTracks(tracks)
  const count = uniqueTracks.filter(getProperty).length
  const total = uniqueTracks.length
  const percent = total > 0 ? Math.round((count / total) * 100) : 0
  return { count, total, percent }
}
