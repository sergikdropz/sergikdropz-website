/**
 * DSP Masters — Cloudflare R2 prefix + local export matching for distribution WAVs.
 *
 * R2 layout: audio/dsp-masters/{release-slug}/{ISRC}-{Title}.wav
 * Vault sidebar: "DSP Masters" playlist folder (see DSP_MASTERS_FOLDER_ID).
 */

import { readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { DEFAULT_EXPORTS_ROOT, normalizeAudioStem } from '@/lib/audio/export-folder-dates'
import { normalizeTitleKey } from '@/lib/studio/distrokid-import'
import { safeAudioFileName } from '@/lib/audio/replace-audio-file'

/** Stable Music Vault folder for distribution masters (playlist-style, like Distrokid Exports). */
export const DSP_MASTERS_FOLDER_ID = 'dsp-masters-vault-001'
export const DSP_MASTERS_FOLDER_NAME = 'DSP Masters'
export const DSP_MASTERS_R2_PREFIX = 'dsp-masters'

export const DEFAULT_DISTROKID_DOWNLOADS = '/Volumes/SERGIK/Distrokid downloads'
export const DEFAULT_ALBUM_RELEASE_MASTERS = '/Volumes/SERGIK/SERGIK ALBUM RELEASE MASTERS'

/** Title aliases when export filenames diverge from DistroKid / Studio titles. */
export const DSP_MASTER_TITLE_ALIASES: Record<string, string[]> = {
  '24 7 mki': ['24 7', '247 vip 1', '247vip1', '24 7 vip 1', '247 mk i'],
  '24 7 mkii': ['24 7 vip 2', '247vip2', '24 7 vip 2', '247 mk ii', '24 7 mkii'],
  recouperate: ['recuperate'],
  recuperate: ['recouperate'],
  heartbeat: ['love again', 'haus of devotion love again', 'x haus of devotion love again'],
  "dmn8r's": ['dmn8rs', 'dmn8rs ftp', "dmn8r's ftp", 'dmn8r ftp vip'],
  zoned: ['zoned feat lugh haurie', 'x lugh haurie zoned'],
  'all the vibes': ['seergik all the vibes'],
  'get on my vibe': ['getonmyvibe'],
  'this is the sound': ['thisisthesound'],
  'elevator musik': ['elevator', 'elevator v2'],
}

export type DspMasterSourceHit = {
  absPath: string
  fileName: string
  sizeBytes: number
  stemKey: string
  folderScore: number
  isrcFromName: string | null
}

export type DspMasterMatch = {
  releaseTitle: string
  trackTitle: string
  isrc: string | null
  hit: DspMasterSourceHit | null
  relativeR2Path: string | null
  reason?: string
}

function slugify(value: string, max = 60): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'track'
  )
}

export function dspMastersReleaseSlug(releaseTitle: string): string {
  return slugify(releaseTitle || 'release')
}

export function isrcFromMasterFileName(fileName: string): string | null {
  const base = basename(fileName)
  const match = base.match(/^([A-Z0-9]{12})[-_]/i)
  if (match) return match[1].toUpperCase()
  const any = base.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/i)
  return any ? any[1].toUpperCase() : null
}

export function dspMastersRelativePath(opts: {
  releaseTitle: string
  trackTitle: string
  isrc?: string | null
  sourceFileName?: string | null
}): string {
  const releaseSlug = slugify(opts.releaseTitle || 'release')
  const titleSlug = slugify(opts.trackTitle || 'track', 48)
  const isrc = opts.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null
  const fromSource = opts.sourceFileName ? safeAudioFileName(opts.sourceFileName) : null
  const fileName =
    isrc && titleSlug
      ? `${isrc}-${titleSlug}.wav`
      : fromSource && /\.wav$/i.test(fromSource)
        ? fromSource
        : `${titleSlug}.wav`
  return `${DSP_MASTERS_R2_PREFIX}/${releaseSlug}/${fileName}`
}

/** True when wav_url already points at a DSP master in R2. */
export function isDspMasterUrl(url: string | null | undefined): boolean {
  return /\/dsp-masters\//i.test(String(url || ''))
}

/** Tracks that still need a real DSP master (empty, pending, or non-wav stream). */
export function trackNeedsDspMaster(wavUrl: string | null | undefined): boolean {
  const url = String(wavUrl || '').trim()
  if (!url) return true
  if (isDspMasterUrl(url)) return false
  if (url.startsWith('pending://')) return true
  if (/\.wav(\?|$)/i.test(url)) return false
  return true
}

/**
 * Pick the best R2 relative path from a list of dsp-masters keys for a track.
 * Prefers ISRC-prefixed filenames, then title slug match.
 */
export function pickDspMasterR2Key(
  keys: string[],
  opts: { trackTitle: string; isrc?: string | null; releaseTitle?: string | null },
): string | null {
  if (!keys.length) return null
  const wantIsrc = opts.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null
  const titleSlug = slugify(opts.trackTitle || 'track', 48)
  const releaseSlug = opts.releaseTitle ? dspMastersReleaseSlug(opts.releaseTitle) : null

  const scored = keys
    .filter((k) => /\.wav$/i.test(k))
    .map((key) => {
      const base = key.split('/').pop() || key
      const isrc = isrcFromMasterFileName(base)
      let score = 0
      if (wantIsrc && isrc === wantIsrc) score += 200
      if (releaseSlug && key.startsWith(`${DSP_MASTERS_R2_PREFIX}/${releaseSlug}/`)) score += 40
      const nameSlug = slugify(base.replace(/\.wav$/i, '').replace(/^[A-Z0-9]{12}-/i, ''), 60)
      if (nameSlug === titleSlug) score += 80
      else if (nameSlug.includes(titleSlug) || titleSlug.includes(nameSlug)) score += 25
      return { key, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.key || null
}

export function folderPriorityForMasterPath(absPath: string): number {
  const lower = absPath.toLowerCase()
  if (lower.includes('/sergik album release masters/')) return 120
  if (lower.includes('/release masters/')) return 110
  if (lower.includes('/distrokid downloads/')) return 105
  if (lower.includes('/exports sergik/sergik wavs/')) return 80
  if (lower.includes('/full ep mix/')) return 70
  if (lower.includes('/sergik stems/')) return 10
  return 40
}

function isRejectedVariant(fileName: string, trackTitle: string): boolean {
  const name = fileName.toLowerCase()
  const title = trackTitle.toLowerCase()
  if (!/instrumental|no vocals/.test(title) && /instrumental|no vocals/.test(name)) return true
  if (!/pre.?master|premaster|-6db/.test(title) && /pre.?master|premaster|-6db/.test(name)) {
    return true
  }
  // Prefer non-VIP unless the track title asks for VIP / mkI / mkII
  if (!/\bvip\b|mk\s*i|mk\s*ii|mki|mkii/.test(title) && /\bvip\b/.test(name)) {
    // DistroKid “Like The Ol Days” ships as Bass VIP — allow when ISRC file or sole candidate
    return false
  }
  return false
}

function stripMasterDecorators(stem: string): string {
  let s = normalizeTitleKey(stem)
  s = s.replace(/^sergik\s+/, '')
  // Leading collab marker when "x" survived normalization
  s = s.replace(/^x\s+\S+\s+/i, '')
  // Trailing tech tags
  s = s
    .replace(/\s+v\d+\b/g, ' ')
    .replace(/\s+\d{2,3}\s*bpm\b/g, ' ')
    .replace(/\s+[a-g](?:#|b)?\s*(?:maj|min|major|minor)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

function titlesLooselyEqual(hitStem: string, trackTitle: string): boolean {
  const wantRaw = normalizeTitleKey(trackTitle)
  const want = stripMasterDecorators(trackTitle)
  const hit = stripMasterDecorators(hitStem)
  if (!want || !hit) return false
  if (hit === want) return true

  // Preserve version tags when the studio title includes them (Daze V2)
  const hitKeepVersion = normalizeTitleKey(hitStem)
    .replace(/^sergik\s+/, '')
    .replace(/^x\s+\S+\s+/i, '')
  if (hitKeepVersion === wantRaw || hitKeepVersion.startsWith(`${wantRaw} `)) return true

  if (hit === want || hit.startsWith(`${want} `)) return true

  // "slick gangsta" / "bejanis hydrate" — artist token(s) + exact title
  // normalizeAudioStem turns "x" into a space, so collabs become "sergik slick gangsta"
  if (hit.endsWith(` ${want}`)) {
    const prefix = hit.slice(0, hit.length - want.length - 1).trim()
    const prefixWords = prefix.split(' ').filter(Boolean)
    const wantWords = want.split(' ').filter(Boolean)
    // Single-word titles: allow at most one artist token (blocks "more than life" ↔ "life")
    if (wantWords.length === 1) return prefixWords.length <= 1
    // Multi-word titles: allow up to two artist tokens before the title
    return prefixWords.length <= 2
  }

  for (const key of candidateKeysForTitle(trackTitle)) {
    const strippedKey = stripMasterDecorators(key)
    if (!strippedKey) continue
    if (hit === strippedKey || hit.startsWith(`${strippedKey} `)) return true
    if (hitKeepVersion === key || hitKeepVersion.startsWith(`${key} `)) return true
    if (hit.endsWith(` ${strippedKey}`)) {
      const prefix = hit.slice(0, hit.length - strippedKey.length - 1).trim()
      const prefixWords = prefix.split(' ').filter(Boolean)
      const keyWords = strippedKey.split(' ').filter(Boolean)
      if (keyWords.length === 1) return prefixWords.length <= 1
      return prefixWords.length <= 2
    }
  }
  return false
}

function variantPenalty(fileName: string, trackTitle: string): number {
  const name = fileName.toLowerCase()
  const title = trackTitle.toLowerCase()
  let penalty = 0
  if (!/\bvip\b|mk\s*i|mk\s*ii/.test(title) && /\bvip\b/.test(name)) penalty += 15
  if (!/master/.test(title) && /pre.?master|premaster/.test(name)) penalty += 40
  if (/remix|redubb|edit|xtendo|extended/.test(name) && !/remix|edit|extended/.test(title)) {
    penalty += 20
  }
  if (!/\bep mix\b|\bmix\b/.test(title) && /\bep mix\b/.test(name)) penalty += 50
  if (!/\bv\d+\b/.test(title) && /\bv\d+\b/.test(name)) penalty += 6
  if (/master(?!ing)/.test(name) && !/pre/.test(name)) penalty -= 8
  return penalty
}

/** How tightly the file stem matches the track title (higher = better). */
function titleMatchBonus(hitStem: string, trackTitle: string): number {
  const want = normalizeTitleKey(trackTitle)
  const hit = stripMasterDecorators(hitStem)
  if (!want || !hit) return 0
  if (hit === want) return 80
  if (hit.startsWith(`${want} `)) return 70
  if (hit.includes(` ${want} `) || hit.endsWith(` ${want}`)) {
    const wantWords = want.split(' ').filter(Boolean)
    if (wantWords.length === 1) return 10
    return 55
  }
  return 0
}

function walkWavFiles(root: string, out: DspMasterSourceHit[] = []): DspMasterSourceHit[] {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    if (ent.name.startsWith('._') || ent.name === '.DS_Store') continue
    const abs = join(root, ent.name)
    if (ent.isDirectory()) {
      if (/\.download$/i.test(ent.name) || /stems/i.test(ent.name)) continue
      walkWavFiles(abs, out)
      continue
    }
    if (!ent.isFile()) continue
    if (extname(ent.name).toLowerCase() !== '.wav') continue
    let sizeBytes = 0
    try {
      sizeBytes = statSync(abs).size
    } catch {
      continue
    }
    if (sizeBytes < 1000) continue
    out.push({
      absPath: abs,
      fileName: ent.name,
      sizeBytes,
      stemKey: normalizeAudioStem(ent.name),
      folderScore: folderPriorityForMasterPath(abs),
      isrcFromName: isrcFromMasterFileName(ent.name),
    })
  }
  return out
}

export function scanDspMasterSources(roots: string[]): DspMasterSourceHit[] {
  const out: DspMasterSourceHit[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    if (!root?.trim()) continue
    for (const hit of walkWavFiles(root.trim())) {
      if (seen.has(hit.absPath)) continue
      seen.add(hit.absPath)
      out.push(hit)
    }
  }
  return out
}

export function defaultDspMasterScanRoots(opts?: {
  exportsRoot?: string
  distrokidDownloads?: string
  albumReleaseMasters?: string
}): string[] {
  return [
    opts?.albumReleaseMasters || DEFAULT_ALBUM_RELEASE_MASTERS,
    opts?.exportsRoot || DEFAULT_EXPORTS_ROOT,
    opts?.distrokidDownloads || DEFAULT_DISTROKID_DOWNLOADS,
  ]
}

function candidateKeysForTitle(title: string): string[] {
  const base = normalizeTitleKey(title)
  const stem = normalizeAudioStem(title)
  const keys = new Set<string>()
  const push = (k: string) => {
    const v = normalizeTitleKey(k)
    if (v) keys.add(v)
  }
  push(base)
  push(stem)
  push(stem.replace(/^sergik\s+/, ''))
  push(base.replace(/^sergik\s+/, ''))
  for (const alias of DSP_MASTER_TITLE_ALIASES[base] || []) push(alias)
  for (const alias of DSP_MASTER_TITLE_ALIASES[stem] || []) push(alias)
  return [...keys]
}

function scoreCandidate(hit: DspMasterSourceHit, trackTitle: string, wantIsrc: string | null): number {
  let score = hit.folderScore
  if (wantIsrc && hit.isrcFromName === wantIsrc) score += 200
  score += titleMatchBonus(hit.stemKey, trackTitle)
  score -= variantPenalty(hit.fileName, trackTitle)
  // Prefer larger masters when scores tie — but cap so a 310MB EP mix can't beat a tight title match
  score += Math.min(8, hit.sizeBytes / (50 * 1024 * 1024))
  return score
}

export function matchTrackToDspMaster(
  sources: DspMasterSourceHit[],
  opts: { trackTitle: string; isrc?: string | null; releaseTitle?: string | null },
): DspMasterSourceHit | null {
  const wantIsrc = opts.isrc?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null
  if (wantIsrc) {
    const byIsrc = sources.filter((s) => s.isrcFromName === wantIsrc)
    if (byIsrc.length) {
      return [...byIsrc].sort(
        (a, b) => scoreCandidate(b, opts.trackTitle, wantIsrc) - scoreCandidate(a, opts.trackTitle, wantIsrc),
      )[0]
    }
  }

  const keys = candidateKeysForTitle(opts.trackTitle)
  const pool: DspMasterSourceHit[] = []
  for (const hit of sources) {
    if (isRejectedVariant(hit.fileName, opts.trackTitle)) continue
    const matched =
      titlesLooselyEqual(hit.stemKey, opts.trackTitle) ||
      keys.some((k) => titlesLooselyEqual(hit.stemKey, k))
    if (matched) pool.push(hit)
  }

  if (!pool.length) return null
  return [...pool].sort(
    (a, b) => scoreCandidate(b, opts.trackTitle, wantIsrc) - scoreCandidate(a, opts.trackTitle, wantIsrc),
  )[0]
}

export function buildDspMasterMatches(
  sources: DspMasterSourceHit[],
  tracks: Array<{
    releaseTitle: string
    trackTitle: string
    isrc?: string | null
  }>,
): DspMasterMatch[] {
  return tracks.map((t) => {
    const hit = matchTrackToDspMaster(sources, {
      trackTitle: t.trackTitle,
      isrc: t.isrc,
      releaseTitle: t.releaseTitle,
    })
    if (!hit) {
      return {
        releaseTitle: t.releaseTitle,
        trackTitle: t.trackTitle,
        isrc: t.isrc || null,
        hit: null,
        relativeR2Path: null,
        reason: 'no local WAV match',
      }
    }
    return {
      releaseTitle: t.releaseTitle,
      trackTitle: t.trackTitle,
      isrc: t.isrc || null,
      hit,
      relativeR2Path: dspMastersRelativePath({
        releaseTitle: t.releaseTitle,
        trackTitle: t.trackTitle,
        isrc: t.isrc,
        sourceFileName: hit.fileName,
      }),
    }
  })
}
