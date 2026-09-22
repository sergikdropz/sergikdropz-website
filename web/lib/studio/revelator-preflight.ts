/**
 * Revelator delivery preflight — audio/art, metadata, rights, Beatport, migration locks.
 * Enforced before live/dry-run aggregator distribute (force can bypass soft warnings only).
 */

import { isDspStoreId, type DspStoreId } from '@/lib/studio/constants'
import { artworkPolicyWarnings } from '@/lib/studio/dsp-ingest'
import { parseUgcPack, type UgcPack } from '@/lib/studio/ugc-pack'
import {
  resolveRevelatorTargetStores,
  type ResolveTargetStoresResult,
} from '@/lib/studio/revelator-store-map'

export type RevelatorDeliveryRights = {
  streaming: boolean
  download: boolean
  ugc: boolean
  /** Ops confirmed Beatport enablement with Revelator Support. */
  beatport_enabled: boolean
  /** Attest content is fully original/exclusive for UGC DSPs. */
  track_origin_original: boolean
  /** Operator acknowledges DistroKid→Revelator linking field lock. */
  linking_fields_acknowledged: boolean
}

export const DEFAULT_REVELATOR_RIGHTS: RevelatorDeliveryRights = {
  streaming: true,
  download: true,
  ugc: true,
  beatport_enabled: false,
  track_origin_original: false,
  linking_fields_acknowledged: false,
}

const UGC_STORES: DspStoreId[] = ['youtube', 'tiktok', 'instagram']

/** Beatport-oriented genres (subset; Open Format expands over time). */
const BEATPORT_GENRE_NEEDLES = [
  'house',
  'techno',
  'tech house',
  'deep house',
  'minimal',
  'progressive',
  'trance',
  'drum',
  'bass',
  'dubstep',
  'garage',
  'break',
  'electro',
  'edm',
  'dance',
  'hardcore',
  'hardstyle',
  'jungle',
  'dnb',
  'drum and bass',
  'afro',
  'organic',
  'melodic',
]

const BANNED_TITLE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  { re: /\bexclusive\b/i, hint: 'Remove “Exclusive” from titles' },
  { re: /\bdigital\s*only\b/i, hint: 'Remove “Digital Only” from titles' },
  { re: /\batmos\b/i, hint: 'Don’t put Atmos in the title — use format flags' },
  { re: /\b24[\s-]?bit\b/i, hint: 'Don’t put bit depth in the title' },
  { re: /\bringtone\b/i, hint: 'Ringtone is not a release title suffix' },
  { re: /\bexplicit\b/i, hint: 'Use the explicit flag, not the word in the title' },
  { re: /\bclean\b/i, hint: 'Use the clean/radio-edit flag, not “Clean” in the title' },
  { re: /https?:\/\//i, hint: 'Titles cannot contain URLs' },
  { re: /www\./i, hint: 'Titles cannot contain web addresses' },
]

export type PreflightTrack = {
  id?: string
  title: string
  isrc?: string | null
  wav_url?: string | null
  duration_seconds?: number | null
  explicit?: boolean | null
}

export type PreflightRelease = {
  id: string
  title: string
  upc?: string | null
  artwork_url?: string | null
  /** Separate DSP-ready cover (release-covers folder) — preferred for aggregator. */
  artwork_dsp_url?: string | null
  genre?: string | null
  subgenre?: string | null
  album_artist?: string | null
  previously_released?: boolean | null
  previous_upc?: string | null
  marketing_copy?: unknown
  target_stores?: string[] | null
  tracks: PreflightTrack[]
}

export type PreflightIssue = {
  id: string
  severity: 'blocker' | 'warning'
  message: string
}

export type RevelatorPreflightResult = {
  ok: boolean
  blockers: string[]
  warnings: string[]
  issues: PreflightIssue[]
  rights: RevelatorDeliveryRights
  ugcPack: UgcPack
  resolvedStores: ResolveTargetStoresResult
  /** Targets after rights/Beatport filtering. */
  effectiveTargets: DspStoreId[]
  checklist: Array<{ id: string; label: string; href?: string; done?: boolean }>
  /** Optional server-side artwork probe (distribute GET). */
  artworkProbe?: {
    site: ArtworkProbeSummary | null
    dsp: ArtworkProbeSummary | null
  }
  masters?: MastersReadiness
}

export type ArtworkProbeSummary = {
  url: string
  width: number
  height: number
  bytes: number
  format?: string
  ok: boolean
  issues: string[]
  error?: string
}

export type MastersReadiness = {
  trackCount: number
  withIsrc: number
  withMaster: number
  missingMaster: string[]
  nonLossless: string[]
  missingIsrc: string[]
}

export function summarizeMastersReadiness(tracks: PreflightTrack[]): MastersReadiness {
  const missingMaster: string[] = []
  const nonLossless: string[] = []
  const missingIsrc: string[] = []
  let withIsrc = 0
  let withMaster = 0
  for (const track of tracks) {
    const title = track.title || 'Untitled'
    if (String(track.isrc || '').trim()) withIsrc += 1
    else missingIsrc.push(title)
    const wav = String(track.wav_url || '').trim()
    if (!wav) {
      missingMaster.push(title)
      continue
    }
    if (!isAggregatorMasterUrl(wav)) {
      nonLossless.push(title)
      continue
    }
    withMaster += 1
  }
  return {
    trackCount: tracks.length,
    withIsrc,
    withMaster,
    missingMaster,
    nonLossless,
    missingIsrc,
  }
}

export function artworkProbeToIssues(
  probe: ArtworkProbeSummary,
  kind: 'site' | 'dsp'
): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  if (probe.error) {
    issues.push({
      id: `artwork-probe-${kind}`,
      severity: kind === 'dsp' ? 'blocker' : 'warning',
      message: `Could not probe ${kind} artwork: ${probe.error}`,
    })
    return issues
  }
  if (!probe.ok) {
    issues.push({
      id: `artwork-dims-${kind}`,
      severity: 'blocker',
      message:
        kind === 'dsp'
          ? `DSP cover is ${probe.width}×${probe.height} — regenerate (≥1400²).`
          : `Site artwork is ${probe.width}×${probe.height} — need ≥1400² source before DSP cover.`,
    })
  }
  for (const msg of probe.issues) {
    if (/not square/i.test(msg) && kind === 'site') {
      issues.push({
        id: `artwork-square-${kind}`,
        severity: 'warning',
        message: `${msg} — DSP cover will center-crop.`,
      })
    } else if (/10MB|MB/i.test(msg) && kind === 'site') {
      issues.push({
        id: `artwork-bytes-${kind}`,
        severity: 'warning',
        message: msg,
      })
    }
  }
  return issues
}

export function mergeProbeIntoPreflight(
  result: RevelatorPreflightResult,
  probe: { site: ArtworkProbeSummary | null; dsp: ArtworkProbeSummary | null },
  masters: MastersReadiness
): RevelatorPreflightResult {
  const issues = [...result.issues]
  if (probe.site) issues.push(...artworkProbeToIssues(probe.site, 'site'))
  if (probe.dsp) issues.push(...artworkProbeToIssues(probe.dsp, 'dsp'))
  const blockers = issues.filter((i) => i.severity === 'blocker').map((i) => i.message)
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message)
  const checklist = result.checklist.map((item) =>
    item.id === 'dsp-cover'
      ? { ...item, done: Boolean(probe.dsp?.ok && !probe.dsp.error) || item.done }
      : item
  )
  return {
    ...result,
    issues,
    blockers,
    warnings,
    ok: blockers.length === 0,
    artworkProbe: probe,
    masters,
    checklist,
  }
}

export function parseRevelatorDeliveryRights(raw: unknown): RevelatorDeliveryRights {
  const base = { ...DEFAULT_REVELATOR_RIGHTS }
  if (!raw || typeof raw !== 'object') return base
  const copy = raw as Record<string, unknown>
  const nested =
    copy.revelator_delivery && typeof copy.revelator_delivery === 'object'
      ? (copy.revelator_delivery as Record<string, unknown>)
      : copy
  return {
    streaming: nested.streaming !== false,
    download: nested.download !== false,
    ugc: nested.ugc !== false,
    beatport_enabled: nested.beatport_enabled === true,
    track_origin_original: nested.track_origin_original === true,
    linking_fields_acknowledged: nested.linking_fields_acknowledged === true,
  }
}

/** Prefer dedicated DSP cover URL over site artwork. */
export function resolveArtworkDspUrl(release: {
  artwork_dsp_url?: string | null
  artwork_url?: string | null
  marketing_copy?: unknown
}): string | null {
  const col = String(release.artwork_dsp_url || '').trim()
  if (col) return col
  const copy = (release.marketing_copy || {}) as Record<string, unknown>
  const nested = copy.revelator_delivery as Record<string, unknown> | undefined
  const fromNested = String(nested?.artwork_dsp_url || '').trim()
  if (fromNested) return fromNested
  const fromCopy = String(copy.artwork_dsp_url || '').trim()
  return fromCopy || null
}

export function marketingCopyWithRevelatorRights(
  existing: Record<string, unknown> | null | undefined,
  rights: Partial<RevelatorDeliveryRights>
): Record<string, unknown> {
  const prev = existing || {}
  const current = parseRevelatorDeliveryRights(prev)
  return {
    ...prev,
    revelator_delivery: { ...current, ...rights },
  }
}

function mediaExt(url: string): string {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-z0-9]+)$/i)
    return (m?.[1] || '').toLowerCase()
  } catch {
    const m = url.split('?')[0].match(/\.([a-z0-9]+)$/i)
    return (m?.[1] || '').toLowerCase()
  }
}

export function isAggregatorMasterUrl(url: string): boolean {
  const ext = mediaExt(url)
  return ext === 'wav' || ext === 'flac' || /\/(wav|flac)(\/|$)/i.test(url)
}

export function isAggregatorArtworkUrl(url: string): boolean {
  const ext = mediaExt(url)
  return ['jpg', 'jpeg', 'png', 'jfif', 'webp'].includes(ext) || /image/i.test(url)
}

export function beatportGenreAllowed(genre: string | null | undefined, subgenre?: string | null): boolean {
  const hay = `${genre || ''} ${subgenre || ''}`.toLowerCase()
  if (!hay.trim()) return false
  return BEATPORT_GENRE_NEEDLES.some((n) => hay.includes(n))
}

export function lintReleaseTitles(titles: string[]): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  for (const title of titles) {
    const t = String(title || '').trim()
    if (!t) continue
    for (const rule of BANNED_TITLE_PATTERNS) {
      if (rule.re.test(t)) {
        issues.push({
          id: `title-ban:${t.slice(0, 24)}`,
          severity: 'blocker',
          message: `${rule.hint}: “${t}”`,
        })
      }
    }
  }
  return issues
}

/**
 * Filter Studio targets for Revelator queue given rights + Beatport enablement.
 */
export function filterTargetsForRevelator(input: {
  targets: string[]
  rights: RevelatorDeliveryRights
}): { effective: DspStoreId[]; dropped: Array<{ store: DspStoreId; reason: string }> } {
  const dropped: Array<{ store: DspStoreId; reason: string }> = []
  const effective: DspStoreId[] = []
  for (const raw of input.targets) {
    if (!isDspStoreId(raw)) continue
    if (!input.rights.streaming && !UGC_STORES.includes(raw) && raw !== 'shazam') {
      // Streaming off: still allow download-oriented? Keep simple — drop consumer stream DSPs.
      if (!['apple_music', 'amazon'].includes(raw)) {
        dropped.push({ store: raw, reason: 'Streaming rights disabled' })
        continue
      }
    }
    if (!input.rights.ugc && UGC_STORES.includes(raw)) {
      dropped.push({ store: raw, reason: 'UGC rights disabled' })
      continue
    }
    if (raw === 'beatport' && !input.rights.beatport_enabled) {
      dropped.push({
        store: raw,
        reason: 'Beatport not enabled — request enablement via Revelator Support first',
      })
      continue
    }
    effective.push(raw)
  }
  return { effective, dropped }
}

export function runRevelatorPreflight(
  release: PreflightRelease,
  opts?: { force?: boolean; storeOverrides?: Partial<Record<DspStoreId, number>> }
): RevelatorPreflightResult {
  const issues: PreflightIssue[] = []
  const rights = parseRevelatorDeliveryRights(release.marketing_copy)
  const ugcPack = parseUgcPack(
    release.marketing_copy && typeof release.marketing_copy === 'object'
      ? (release.marketing_copy as Record<string, unknown>).ugc_pack
      : null
  )

  const targetsRaw = Array.isArray(release.target_stores) ? release.target_stores : []
  const { effective, dropped } = filterTargetsForRevelator({
    targets: targetsRaw.length ? targetsRaw : [],
    rights,
  })
  // If no targets selected, preflight against all Studio DSPs filtered by rights.
  const baseTargets =
    effective.length > 0
      ? effective
      : filterTargetsForRevelator({
          targets: [
            'spotify',
            'apple_music',
            'youtube_music',
            'youtube',
            'tiktok',
            'instagram',
            'amazon',
            'tidal',
            'deezer',
            'beatport',
          ],
          rights,
        }).effective

  for (const d of dropped) {
    issues.push({
      id: `drop:${d.store}`,
      severity: 'warning',
      message: `${d.store}: ${d.reason}`,
    })
  }

  if (!release.tracks.length) {
    issues.push({ id: 'tracks', severity: 'blocker', message: 'Add at least one track.' })
  }

  for (const track of release.tracks) {
    if (!String(track.isrc || '').trim()) {
      issues.push({
        id: `isrc:${track.title}`,
        severity: 'blocker',
        message: `Missing ISRC: ${track.title}`,
      })
    }
    const wav = String(track.wav_url || '').trim()
    if (!wav) {
      issues.push({
        id: `wav-missing:${track.title}`,
        severity: 'blocker',
        message: `Missing master WAV/FLAC URL: ${track.title}`,
      })
    } else if (!isAggregatorMasterUrl(wav)) {
      issues.push({
        id: `wav-format:${track.title}`,
        severity: 'blocker',
        message: `Aggregator needs WAV or FLAC master (not MP3/stream): ${track.title}`,
      })
    }
    if (
      track.duration_seconds != null &&
      Number.isFinite(track.duration_seconds) &&
      track.duration_seconds > 0 &&
      track.duration_seconds < 2
    ) {
      issues.push({
        id: `duration:${track.title}`,
        severity: 'blocker',
        message: `Track shorter than 2 seconds: ${track.title}`,
      })
    }
  }

  const artSite = String(release.artwork_url || '').trim()
  const artDsp = resolveArtworkDspUrl(release)
  const art = artDsp || artSite
  if (!artSite && !artDsp) {
    issues.push({ id: 'artwork', severity: 'blocker', message: 'Release artwork URL is required.' })
  } else if (artSite && !isAggregatorArtworkUrl(artSite) && !artDsp) {
    issues.push({
      id: 'artwork-format',
      severity: 'blocker',
      message: 'Artwork must be JPG/PNG (square ≥1400px). Generate a DSP cover from Delivery.',
    })
  }
  if (artSite && !artDsp) {
    issues.push({
      id: 'artwork-dsp-missing',
      severity: 'blocker',
      message:
        'Generate DSP-ready cover (Delivery → DSP cover) — stored under release-covers/ so site art stays full-res.',
    })
  }
  for (const warning of artworkPolicyWarnings({ url: artSite || art })) {
    issues.push({
      id: `artwork-policy:${warning.slice(0, 20)}`,
      severity: warning.includes('already used') ? 'blocker' : 'warning',
      message: warning,
    })
  }

  issues.push(...lintReleaseTitles([release.title, ...release.tracks.map((t) => t.title)]))

  if (!release.upc?.trim()) {
    issues.push({
      id: 'upc',
      severity: 'blocker',
      message: 'UPC is required for aggregator delivery.',
    })
  }

  if (release.previously_released) {
    if (!rights.linking_fields_acknowledged) {
      issues.push({
        id: 'linking-lock',
        severity: 'blocker',
        message:
          'Previously released: acknowledge linking field lock (do not change ISRC, audio, title, artists, length, explicit until Spotify play counts merge).',
      })
    }
    issues.push({
      id: 'upc-policy',
      severity: 'warning',
      message:
        'Confirm UPC strategy with Revelator — helpdesk says don’t reuse prior-distributor UPCs; keep-streams migrations often keep DistroKid UPC. Ask Support which applies.',
    })
    if (release.previous_upc && release.upc && release.previous_upc === release.upc) {
      issues.push({
        id: 'upc-same',
        severity: 'warning',
        message: 'UPC matches previous_upc — verify with Revelator before live queue.',
      })
    }
  }

  const wantsUgc = baseTargets.some((s) => UGC_STORES.includes(s))
  if (wantsUgc) {
    if (!rights.ugc) {
      issues.push({
        id: 'ugc-rights',
        severity: 'blocker',
        message: 'UGC stores selected but UGC rights are off.',
      })
    }
    if (!rights.track_origin_original) {
      issues.push({
        id: 'ugc-origin',
        severity: 'blocker',
        message:
          'Attest track origin is fully original/exclusive before YouTube CID, TikTok, or Meta Rights Manager.',
      })
    }
    if (ugcPack.status === 'ineligible') {
      issues.push({
        id: 'ugc-ineligible',
        severity: 'blocker',
        message: 'UGC pack marked ineligible — clear Rights → SERGIK UGC pack first.',
      })
    }
  }

  if (baseTargets.includes('beatport')) {
    if (!rights.beatport_enabled) {
      issues.push({
        id: 'beatport-enabled',
        severity: 'blocker',
        message:
          'Beatport requires Revelator Support enablement per workspace before distribute.',
      })
    }
    if (!beatportGenreAllowed(release.genre, release.subgenre)) {
      issues.push({
        id: 'beatport-genre',
        severity: 'blocker',
        message: `Genre “${release.genre || 'unset'}” may be rejected by Beatport — use Dance/EDM genres or deselect Beatport.`,
      })
    }
  }

  if (!rights.streaming) {
    issues.push({
      id: 'streaming-off',
      severity: 'warning',
      message: 'Streaming rights disabled — consumer stream DSPs were filtered from the queue.',
    })
  }

  const resolvedStores = resolveRevelatorTargetStores(baseTargets, opts?.storeOverrides)

  if (resolvedStores.storeIds.length === 0 && !opts?.force) {
    issues.push({
      id: 'no-stores',
      severity: 'blocker',
      message:
        'No curated Revelator store IDs for selected targets. After partner access, sync GET /common/lookup/stores.',
    })
  }

  for (const u of resolvedStores.unsupported) {
    issues.push({
      id: `unsupported:${u.store}`,
      severity: 'warning',
      message: `${u.name}: ${u.note || 'Not in curated Revelator map yet'}`,
    })
  }

  const blockers = issues.filter((i) => i.severity === 'blocker').map((i) => i.message)
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message)

  const checklist = [
    {
      id: 'dsp-cover',
      label: 'DSP cover in release-covers/ (1400–3000px JPEG; site artwork_url stays full-res)',
      done: Boolean(resolveArtworkDspUrl(release)),
    },
    {
      id: 'deals',
      label: 'Complete Revelator Distribution Deals Worksheet (ops — required before live distribute)',
      href: 'https://helpdesk.revelator.com/support/solutions/articles/69000829294-onboarding-to-revelator-pro',
    },
    {
      id: 'keys',
      label: 'Set REVELATOR_API_KEY + REVELATOR_PARTNER_USER_ID and REVELATOR_DRY_RUN=0',
    },
    {
      id: 'fb-ig',
      label: 'Whitelist Facebook Page / Instagram (muting own posts)',
      href: 'https://helpdesk.revelator.com/support/solutions/articles/69000808655-whitelisting-a-facebook-page-or-instagram-account',
      done: Boolean(rights.ugc),
    },
    {
      id: 'yt',
      label: 'Safelist YouTube channel ID for Content ID',
      href: 'https://helpdesk.revelator.com/support/solutions/articles/69000801858-safelisting-whitelisting-a-youtube-channel',
    },
    {
      id: 'beatport',
      label: 'Request Beatport enablement ticket (workspace + label name)',
      href: 'https://helpdesk.revelator.com/support/solutions/articles/69000815107-how-to-deliver-to-beatport-why-your-label-name-will-be-modified',
      done: rights.beatport_enabled,
    },
    {
      id: 'linking',
      label: 'Migration: lock ISRC/audio/title/artists until Spotify linking confirmed (~1 week)',
      href: 'https://helpdesk.revelator.com/support/solutions/articles/69000827919-track-linking',
      done: !release.previously_released || rights.linking_fields_acknowledged,
    },
  ]

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    issues,
    rights,
    ugcPack,
    resolvedStores,
    effectiveTargets: baseTargets,
    checklist,
  }
}

/** Finalize ok flag; force still requires hard media/ISRC/artwork blockers. */
export function finalizePreflight(
  result: RevelatorPreflightResult,
  force?: boolean
): RevelatorPreflightResult {
  if (!force) {
    return { ...result, ok: result.blockers.length === 0 }
  }
  const hard = result.issues
    .filter((i) => i.severity === 'blocker')
    .filter((i) =>
      /wav|flac|isrc|artwork|duration|aggregator needs|missing master/i.test(i.id + i.message)
    )
    .map((i) => i.message)
  return { ...result, blockers: hard, warnings: result.warnings, ok: hard.length === 0 }
}
