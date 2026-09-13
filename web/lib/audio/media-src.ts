/**
 * Media element src comparisons.
 *
 * Assigning `el.src` — even to the same URL — aborts the current resource,
 * dumps the buffer, and restarts from 0. Compare before load.
 */

import {
  vaultAssetPathsMatch,
  vaultRelativePathCandidates,
} from '@/lib/audio/vault-audio-extensions'
import {
  extractVaultRelativePath,
  normalizeVaultAudioUrl,
  toSameOriginMediaUrl,
} from '@/utils/normalizeVaultAudioUrl'
import { isDirectPlayableUrl, isEdgePlaybackUrl } from '@/lib/audio/edge-playback-url'

export function mediaUrlsRoughlyEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  if (a === b) return true
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://local.test/'
    const ua = new URL(a, base)
    const ub = new URL(b, base)
    return ua.pathname === ub.pathname
  } catch {
    return a.includes(b) || b.includes(a)
  }
}

function mediaBasename(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  try {
    const decoded = decodeURIComponent(clean)
    return decoded.split('/').filter(Boolean).pop() || ''
  } catch {
    return clean.split('/').filter(Boolean).pop() || ''
  }
}

function vaultRelativeFromMediaRef(urlOrPath: string): string | null {
  return (
    extractVaultRelativePath(urlOrPath, { preferMp3: false }) ||
    extractVaultRelativePath(urlOrPath)
  )
}

/** Same-origin media URL for a vault-relative path. */
export function mediaUrlForVaultRelative(relative: string): string {
  return `/api/audio/media/${relative.split('/').map(encodeURIComponent).join('/')}`
}

/** Ordered extension variants for client-side playback retries. */
export function mediaUrlExtensionCandidates(
  trackFile?: string | null,
  resolvedUrl?: string | null,
): string[] {
  const rel =
    vaultRelativeFromMediaRef(resolvedUrl || '') ||
    vaultRelativeFromMediaRef(trackFile || '')
  if (!rel) return []
  return vaultRelativePathCandidates(rel).map(mediaUrlForVaultRelative)
}

/** True when `url` is a playback form of this track's vault file (not the previous song). */
export function mediaUrlMatchesTrack(url?: string | null, trackFile?: string | null): boolean {
  if (!url || !trackFile) return false
  if (mediaUrlsRoughlyEqual(url, trackFile)) return true
  const urlRel = vaultRelativeFromMediaRef(url)
  const fileRel = vaultRelativeFromMediaRef(trackFile)
  if (urlRel && fileRel && vaultAssetPathsMatch(urlRel, fileRel)) return true
  const a = mediaBasename(url)
  const b = mediaBasename(trackFile)
  return Boolean(a && b && a === b)
}

/** Set src only when the URL actually changed. Returns true if reassigned.
 * Do not call `load()` after setting `.src` — assigning `src` already runs the
 * media element load algorithm; a second `load()` aborts that fetch and restarts
 * (visible as a buffering / reload flash).
 */
export function assignMediaSrcIfChanged(el: HTMLMediaElement, url: string): boolean {
  const current = el.currentSrc || el.src || ''
  if (mediaUrlsRoughlyEqual(current, url)) return false
  el.src = url
  return true
}

/** Same-render play URL so skip chrome and <audio src> stay on the same track. */
export function peekSyncPlaybackUrl(
  file?: string | null,
  cache?: Map<string, string>,
): string | null {
  if (!file) return null
  const cached = cache?.get(file)
  if (cached && isDirectPlayableUrl(cached) && !isEdgePlaybackUrl(cached)) return cached
  const sync = toSameOriginMediaUrl(file) || normalizeVaultAudioUrl(file)
  if (sync && isDirectPlayableUrl(sync)) {
    cache?.set(file, sync)
    return sync
  }
  return null
}
