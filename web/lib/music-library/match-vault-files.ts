/**
 * Match OS-dropped audio filenames to vault tracks under one rooted tree
 * (web/public/audio → relative paths like unreleased/…).
 * Never invents uploads — only resolves existing catalog rows.
 */

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?|webm)$/i

export type DroppedFileRef = {
  /** Basename or full path from the OS drop */
  name: string
  /** Optional webkitRelativePath or path hint */
  path?: string
}

export type VaultMatchCandidate = {
  id: string
  title?: string | null
  artist?: string | null
  file_url?: string | null
  file_path?: string | null
  file_name?: string | null
  audio_file_id?: string | null
}

export function isAudioDropName(name: string): boolean {
  return AUDIO_EXT.test(name || '')
}

/** Basename only, decoded, trimmed. */
export function dropBasename(ref: DroppedFileRef): string {
  const raw = (ref.path || ref.name || '').trim()
  const noQuery = raw.split('?')[0].split('#')[0]
  const parts = noQuery.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Best vault-relative hint from a drop (under /audio/ if present).
 * Browsers rarely expose absolute disk paths; relative folder drops do.
 */
export function dropVaultRelativeHint(ref: DroppedFileRef): string | null {
  const raw = (ref.path || ref.name || '').trim().replace(/\\/g, '/')
  if (!raw) return null
  const lower = raw.toLowerCase()
  const audioIdx = lower.indexOf('/audio/')
  if (audioIdx >= 0) {
    return decodeSafe(raw.slice(audioIdx + '/audio/'.length)).replace(/\.wav$/i, '.mp3')
  }
  if (lower.startsWith('audio/')) {
    return decodeSafe(raw.slice('audio/'.length)).replace(/\.wav$/i, '.mp3')
  }
  if (lower.startsWith('unreleased/') || lower.startsWith('released/')) {
    return decodeSafe(raw).replace(/\.wav$/i, '.mp3')
  }
  // Folder drop: "Playlists/Happy Camper/track.mp3" — keep as relative hint
  if (raw.includes('/') && isAudioDropName(raw)) {
    return decodeSafe(raw).replace(/\.wav$/i, '.mp3')
  }
  return null
}

function decodeSafe(value: string): string {
  try {
    if (/%[0-9A-Fa-f]{2}/.test(value)) return decodeURIComponent(value)
  } catch {
    /* keep */
  }
  return value
}

function normalizeKey(value: string): string {
  return decodeSafe(value)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^audio\//i, '')
    .replace(/\.wav$/i, '.mp3')
    .toLowerCase()
}

function basenameKey(value: string): string {
  const parts = normalizeKey(value).split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Score how well a catalog row matches a dropped file.
 * Higher is better; 0 = no match.
 */
export function scoreVaultMatch(candidate: VaultMatchCandidate, ref: DroppedFileRef): number {
  const base = basenameKey(dropBasename(ref))
  if (!base || !isAudioDropName(base)) return 0

  const relHint = dropVaultRelativeHint(ref)
  const path = candidate.file_path || ''
  const url = candidate.file_url || ''
  const name = candidate.file_name || ''
  const title = (candidate.title || '').toLowerCase()

  const pathKey = normalizeKey(path)
  const urlKey = normalizeKey(url)
  const nameKey = basenameKey(name || path || url)

  if (relHint) {
    const hintKey = normalizeKey(relHint)
    if (pathKey === hintKey || pathKey.endsWith('/' + hintKey)) return 100
    if (urlKey.includes('/' + hintKey) || urlKey.endsWith(hintKey)) return 95
  }

  if (nameKey === base) return 80
  if (pathKey.endsWith('/' + base) || pathKey === base) return 75
  if (urlKey.includes('/' + base)) return 70

  // Title fallback: "SERGIK - Happy Camper.mp3" → title contains stem
  const stem = base.replace(AUDIO_EXT, '').toLowerCase()
  if (stem.length >= 4 && title && (title === stem || stem.includes(title) || title.includes(stem))) {
    return 40
  }

  return 0
}

export type MatchResult = {
  ref: DroppedFileRef
  trackId: string | null
  score: number
  reason: 'matched' | 'ambiguous' | 'unmatched' | 'not_audio'
}

/**
 * Greedy unique matching: each catalog track claimed at most once,
 * preferring highest score per drop.
 */
export function matchDropsToVault(
  refs: DroppedFileRef[],
  candidates: VaultMatchCandidate[],
): MatchResult[] {
  const results: MatchResult[] = refs.map((ref) => {
    if (!isAudioDropName(dropBasename(ref))) {
      return { ref, trackId: null, score: 0, reason: 'not_audio' as const }
    }
    return { ref, trackId: null, score: 0, reason: 'unmatched' as const }
  })

  type Pair = { dropIdx: number; trackId: string; score: number }
  const pairs: Pair[] = []
  for (let i = 0; i < refs.length; i++) {
    if (results[i].reason === 'not_audio') continue
    for (const c of candidates) {
      const score = scoreVaultMatch(c, refs[i])
      if (score > 0) pairs.push({ dropIdx: i, trackId: c.id, score })
    }
  }

  pairs.sort((a, b) => b.score - a.score)
  const usedDrops = new Set<number>()
  const usedTracks = new Set<string>()

  for (const pair of pairs) {
    if (usedDrops.has(pair.dropIdx) || usedTracks.has(pair.trackId)) continue
    // Ambiguity: same drop has another equal-score different track still free?
    const rivals = pairs.filter(
      (p) =>
        p.dropIdx === pair.dropIdx &&
        p.score === pair.score &&
        p.trackId !== pair.trackId &&
        !usedTracks.has(p.trackId),
    )
    if (rivals.length > 0 && pair.score < 70) {
      results[pair.dropIdx] = {
        ref: refs[pair.dropIdx],
        trackId: null,
        score: pair.score,
        reason: 'ambiguous',
      }
      usedDrops.add(pair.dropIdx)
      continue
    }
    results[pair.dropIdx] = {
      ref: refs[pair.dropIdx],
      trackId: pair.trackId,
      score: pair.score,
      reason: 'matched',
    }
    usedDrops.add(pair.dropIdx)
    usedTracks.add(pair.trackId)
  }

  return results
}
