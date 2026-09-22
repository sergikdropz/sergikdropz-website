/**
 * SoundExchange / US ISRC registry helpers.
 *
 * Local-first: Studio can look up and register QTA53 codes against the catalog
 * without remote API credentials. When SOUNDEXCHANGE_API_KEY / ACCOUNT_ID are set,
 * submit/lookup call the remote client; otherwise submissions are recorded locally
 * so Pipeline → ISRCs stays an actionable registry.
 *
 * Public lookup UI: https://isrc.soundexchange.com/
 */

import {
  US_ISRC_REGISTRANT,
  formatISRCDisplay,
  parseISRC,
  resolveSoundExchangeAccountId,
  validateISRC,
} from '@/lib/studio/isrc-format'

export type SoundExchangeMode = 'local' | 'remote'

export type SoundExchangeSubmissionStatus =
  | 'pending'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'error'

export interface SoundExchangeConfig {
  apiKey?: string
  apiSecret?: string
  baseUrl?: string
  accountId?: string
  mode?: SoundExchangeMode
}

export interface ISRCSubmissionData {
  isrc: string
  title: string
  artist: string
  duration?: number
  releaseTitle?: string
  releaseDate?: string
  genre?: string
  explicit?: boolean
  contributors?: Array<{
    name: string
    role: string
  }>
}

export interface SoundExchangeSubmitResult {
  success: boolean
  submissionId?: string
  message?: string
  mode: SoundExchangeMode
}

export type LocalIsrcHit = {
  trackId: string
  title: string
  version?: string | null
  artist: string
  isrc: string
  isrcDisplay: string
  releaseId?: string | null
  releaseTitle?: string | null
  releaseDate?: string | null
  duration?: number | null
  explicit?: boolean | null
  submissionStatus: SoundExchangeSubmissionStatus | null
  submittedAt?: string | null
}

export type RegistryTrackRow = LocalIsrcHit & {
  selectable: boolean
}

export type SoundExchangeRegistryStats = {
  minted: number
  pending: number
  submitted: number
  accepted: number
  rejected: number
  error: number
  ourPrefix: number
}

export function normalizeIsrcInput(value: string | null | undefined): string | null {
  if (!value) return null
  const compact = String(value).replace(/[\s-]/g, '').toUpperCase()
  return validateISRC(compact) ? compact : null
}

export function soundExchangeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SOUNDEXCHANGE_API_KEY?.trim() || env.SOUNDEXCHANGE_ACCOUNT_ID?.trim())
}

export function latestSubmissionByIsrc<
  T extends { isrc?: string | null; submitted_at?: string | null; created_at?: string | null },
>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const isrc = normalizeIsrcInput(row.isrc || '')
    if (!isrc) continue
    const prev = map.get(isrc)
    if (!prev) {
      map.set(isrc, row)
      continue
    }
    const prevTs = Date.parse(String(prev.submitted_at || prev.created_at || 0))
    const nextTs = Date.parse(String(row.submitted_at || row.created_at || 0))
    if (nextTs >= prevTs) map.set(isrc, row)
  }
  return map
}

export function mergeRegistryStats(
  rows: Array<{ isrc: string; submissionStatus: SoundExchangeSubmissionStatus | null }>,
): SoundExchangeRegistryStats {
  const stats: SoundExchangeRegistryStats = {
    minted: rows.length,
    pending: 0,
    submitted: 0,
    accepted: 0,
    rejected: 0,
    error: 0,
    ourPrefix: 0,
  }
  const prefix = US_ISRC_REGISTRANT.prefix
  for (const row of rows) {
    if (row.isrc.startsWith(prefix)) stats.ourPrefix += 1
    const status = row.submissionStatus
    if (!status || status === 'pending') stats.pending += 1
    else if (status === 'submitted') stats.submitted += 1
    else if (status === 'accepted') stats.accepted += 1
    else if (status === 'rejected') stats.rejected += 1
    else if (status === 'error') stats.error += 1
  }
  return stats
}

export function buildLocalLookupResult(input: {
  isrc: string
  hit: LocalIsrcHit | null
  remoteConfigured: boolean
  remote?: Record<string, unknown> | null
}) {
  const normalized = normalizeIsrcInput(input.isrc)
  const parsed = normalized ? parseISRC(normalized) : null
  return {
    isrc: normalized || String(input.isrc || '').toUpperCase(),
    isrcDisplay: normalized ? formatISRCDisplay(normalized) : null,
    parsed,
    found: Boolean(input.hit),
    source: input.hit ? 'catalog' : 'none',
    track: input.hit,
    remoteConfigured: input.remoteConfigured,
    remote: input.remote || null,
    registrant: US_ISRC_REGISTRANT,
    publicLookupUrl: normalized
      ? `https://isrc.soundexchange.com/?isrc=${encodeURIComponent(formatISRCDisplay(normalized))}`
      : 'https://isrc.soundexchange.com/',
  }
}

export class SoundExchangeClient {
  private config: SoundExchangeConfig & { mode: SoundExchangeMode }

  constructor(config: SoundExchangeConfig = {}) {
    const remote = Boolean(config.apiKey || config.accountId)
    this.config = {
      baseUrl: config.baseUrl || 'https://api.soundexchange.com',
      mode: config.mode || (remote ? 'remote' : 'local'),
      ...config,
    }
  }

  get mode(): SoundExchangeMode {
    return this.config.mode
  }

  async submitISRC(data: ISRCSubmissionData): Promise<SoundExchangeSubmitResult> {
    if (this.config.mode === 'local') {
      return {
        success: true,
        submissionId: `sx-local-${normalizeIsrcInput(data.isrc) || Date.now()}`,
        message:
          'Recorded in SERGIK SoundExchange registry (local). Remote API credentials not configured — export USISRC locker CSV to finish at isrc.soundexchange.com.',
        mode: 'local',
      }
    }

    return {
      success: true,
      submissionId: `sx-${Date.now()}`,
      message: 'ISRC queued for SoundExchange (credentials present; remote endpoint stub).',
      mode: 'remote',
    }
  }

  async lookupISRC(isrc: string): Promise<Record<string, unknown>> {
    const normalized = normalizeIsrcInput(isrc)
    if (this.config.mode === 'local') {
      return {
        isrc: normalized || isrc,
        found: false,
        mode: 'local',
        message:
          'Remote SoundExchange lookup not configured — use catalog match from Studio registry.',
      }
    }
    return {
      isrc: normalized || isrc,
      found: false,
      mode: 'remote',
      message: 'Remote SoundExchange lookup stub — catalog match is authoritative in Studio.',
    }
  }

  async batchSubmitISRCs(
    data: ISRCSubmissionData[],
  ): Promise<
    Array<{
      isrc: string
      success: boolean
      error?: string
      submissionId?: string
      mode: SoundExchangeMode
    }>
  > {
    const results = []
    for (const item of data) {
      try {
        const result = await this.submitISRC(item)
        results.push({
          isrc: item.isrc,
          success: result.success,
          error: result.success ? undefined : result.message,
          submissionId: result.submissionId,
          mode: result.mode,
        })
      } catch (error: unknown) {
        results.push({
          isrc: item.isrc,
          success: false,
          error: error instanceof Error ? error.message : 'Submit failed',
          mode: this.config.mode,
        })
      }
    }
    return results
  }
}

/** Always returns a client — local mode when credentials are absent. */
export function createSoundExchangeClient(env: NodeJS.ProcessEnv = process.env): SoundExchangeClient {
  const apiKey = env.SOUNDEXCHANGE_API_KEY?.trim()
  const apiSecret = env.SOUNDEXCHANGE_API_SECRET?.trim()
  const accountId = resolveSoundExchangeAccountId(env.SOUNDEXCHANGE_ACCOUNT_ID)
  const baseUrl = env.SOUNDEXCHANGE_BASE_URL?.trim()
  // Remote flag only when env explicitly provides a key or account id.
  const remote = Boolean(apiKey || env.SOUNDEXCHANGE_ACCOUNT_ID?.trim())

  return new SoundExchangeClient({
    apiKey,
    apiSecret,
    accountId,
    baseUrl,
    mode: remote ? 'remote' : 'local',
  })
}

export function artistFromContributors(
  contributors: unknown,
  fallback = US_ISRC_REGISTRANT.recordingArtist,
): string {
  if (!Array.isArray(contributors) || contributors.length === 0) return fallback
  const names = contributors
    .map((row) => {
      if (!row || typeof row !== 'object') return ''
      const rec = row as Record<string, unknown>
      return String(rec.name || rec.artist || '').trim()
    })
    .filter(Boolean)
  return names[0] || fallback
}
