import type { ResolvedSharePayload, ShareVisibility } from '@/lib/shares/types'

export const SHARE_LISTEN_SOURCE = 'share_listen'

type GateInput = {
  share: { visibility: ShareVisibility }
  collection: { hidden?: boolean } | null
  tracks: { file?: string }[]
}

/** Catalog path segment `unreleased` (not the substring inside other words). */
export function shareFileIsUnreleased(file: string | null | undefined): boolean {
  if (!file) return false
  const path = file.split(/[?#]/)[0] || ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    decoded = path
  }
  const parts = decoded.toLowerCase().split(/[\\/]/).filter(Boolean)
  return parts.includes('unreleased')
}

/**
 * Share links of hidden, unlisted, or unreleased EPs and tracks stay silent
 * until the listener unlocks. Public shares of released catalog play open.
 */
export function shareNeedsListenUnlock(input: GateInput): boolean {
  if (input.share.visibility === 'unlisted') return true
  if (input.collection?.hidden) return true
  return input.tracks.some((track) => shareFileIsUnreleased(track.file))
}

export function lockSharePlayback(payload: ResolvedSharePayload): ResolvedSharePayload {
  return {
    ...payload,
    listenLocked: true,
    tracks: payload.tracks.map((track) => ({
      ...track,
      file: '',
      playbackUrl: null,
    })),
  }
}
