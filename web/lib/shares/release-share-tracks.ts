import type { Track } from '@/utils/musicLibraryApi'

export type ReleaseShareTrack = {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  audioFileId?: string
}

export function mapTracksForReleaseShare(tracks: Track[]): ReleaseShareTrack[] {
  return [...tracks]
    .filter((t) => !t.is_archived)
    .sort((a, b) => (a.display_order ?? a.track_number ?? 0) - (b.display_order ?? b.track_number ?? 0))
    .map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: Number(t.duration) || 0,
      file: t.file,
      audioFileId: t.audioFileId,
    }))
}

export function pickReleaseShareTrack(
  tracks: ReleaseShareTrack[],
  trackId: string | null | undefined,
): ReleaseShareTrack | null {
  if (!tracks.length) return null
  if (trackId) {
    const match = tracks.find((t) => t.id === trackId)
    if (match) return match
  }
  return tracks[0]
}
