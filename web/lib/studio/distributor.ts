/**
 * Revelator aggregator client — real V1 auth + submit/status path with dry-run
 * until partner credentials exist.
 *
 * Docs: https://api-docs.revelator.com/v2/en/getting-started/
 */

import { isDspStoreId, type DspStoreId } from '@/lib/studio/constants'
import {
  mapRevelatorStoreIdToDsp,
  matchLookupStoreName,
  resolveRevelatorTargetStores,
} from '@/lib/studio/revelator-store-map'

export type FetchImpl = typeof fetch

export interface RevelatorConfig {
  apiKey: string
  partnerUserId: string
  baseUrl: string
  platformUrl: string
  enterpriseId?: string | null
  dryRun: boolean
  fetchImpl?: FetchImpl
}

export interface DistributionRelease {
  releaseId: string
  title: string
  type: 'single' | 'ep' | 'album'
  releaseDate: string
  upc?: string | null
  artworkUrl?: string | null
  albumArtist?: string | null
  targetStores?: string[]
  tracks: Array<{
    title: string
    isrc: string
    wavUrl: string
    artworkUrl?: string
    explicit: boolean
  }>
}

export interface DistributionStoreStatus {
  name: DspStoreId | string
  url?: string
  status: string
  distributorStoreId?: number
}

export interface DistributionStatus {
  status: 'pending' | 'processing' | 'delivered' | 'live' | 'error' | 'submitted'
  stores: DistributionStoreStatus[]
  message?: string
  dryRun?: boolean
}

export type AggregatorHealth = {
  /** Client can be constructed (dry-run or live keys). */
  available: boolean
  /** True when calls will not hit Revelator HTTP. */
  dryRun: boolean
  /** Partner API key present. */
  hasApiKey: boolean
  /** Partner user id present. */
  hasPartnerUserId: boolean
  baseUrl: string
  platformUrl: string
  label: 'live' | 'dry_run' | 'unavailable'
}

export type SubmitReleaseResult = {
  releaseId: string
  dryRun: boolean
  queuedStoreIds: number[]
  queuedStores: DspStoreId[]
  unsupported: Array<{ store: DspStoreId; name: string; note?: string }>
  message?: string
}

type TokenCache = { token: string; expiresAt: number }

function envFlag(name: string): boolean {
  const raw = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function readRevelatorEnv(): {
  apiKey: string
  partnerUserId: string
  baseUrl: string
  platformUrl: string
  enterpriseId: string | null
  dryRunForced: boolean
} {
  const apiKey = String(process.env.REVELATOR_API_KEY || '').trim()
  const partnerUserId = String(
    process.env.REVELATOR_PARTNER_USER_ID || process.env.REVELATOR_API_SECRET || ''
  ).trim()
  const baseUrl = (
    process.env.REVELATOR_BASE_URL || 'https://api.revelator.com'
  ).replace(/\/$/, '')
  const platformUrl = (
    process.env.REVELATOR_PLATFORM_URL || 'https://platform.revelator.com'
  ).replace(/\/$/, '')
  const enterpriseId = String(process.env.REVELATOR_ENTERPRISE_ID || '').trim() || null
  return {
    apiKey,
    partnerUserId,
    baseUrl,
    platformUrl,
    enterpriseId,
    dryRunForced: envFlag('REVELATOR_DRY_RUN'),
  }
}

export function getAggregatorHealth(): AggregatorHealth {
  const env = readRevelatorEnv()
  const hasApiKey = Boolean(env.apiKey)
  const hasPartnerUserId = Boolean(env.partnerUserId)
  const liveReady = hasApiKey && hasPartnerUserId
  const dryRun = env.dryRunForced || !liveReady
  const available = dryRun || liveReady
  let label: AggregatorHealth['label'] = 'unavailable'
  if (available && dryRun) label = 'dry_run'
  else if (available && !dryRun) label = 'live'
  return {
    available,
    dryRun,
    hasApiKey,
    hasPartnerUserId,
    baseUrl: env.baseUrl,
    platformUrl: env.platformUrl,
    label,
  }
}

/**
 * Always returns a client when dry-run is allowed (default) so Studio aggregator
 * mode works without credentials. Pass REVELATOR_REQUIRE_LIVE=1 to refuse dry-run.
 */
export function createRevelatorClient(opts?: {
  fetchImpl?: FetchImpl
  forceDryRun?: boolean
}): RevelatorClient | null {
  const env = readRevelatorEnv()
  const liveReady = Boolean(env.apiKey && env.partnerUserId)
  const requireLive = envFlag('REVELATOR_REQUIRE_LIVE')
  const dryRun = opts?.forceDryRun === true || env.dryRunForced || !liveReady

  if (requireLive && dryRun) return null
  if (!dryRun && !liveReady) return null

  return new RevelatorClient({
    apiKey: env.apiKey || 'dry-run-key',
    partnerUserId: env.partnerUserId || 'dry-run-user',
    baseUrl: env.baseUrl,
    platformUrl: env.platformUrl,
    enterpriseId: env.enterpriseId,
    dryRun,
    fetchImpl: opts?.fetchImpl,
  })
}

export class RevelatorClient {
  private config: RevelatorConfig
  private fetchImpl: FetchImpl
  private tokenCache: TokenCache | null = null

  constructor(config: RevelatorConfig) {
    this.config = config
    this.fetchImpl = config.fetchImpl || fetch
  }

  get dryRun(): boolean {
    return this.config.dryRun
  }

  get health(): AggregatorHealth {
    return {
      available: true,
      dryRun: this.config.dryRun,
      hasApiKey: Boolean(this.config.apiKey) && this.config.apiKey !== 'dry-run-key',
      hasPartnerUserId:
        Boolean(this.config.partnerUserId) && this.config.partnerUserId !== 'dry-run-user',
      baseUrl: this.config.baseUrl,
      platformUrl: this.config.platformUrl,
      label: this.config.dryRun ? 'dry_run' : 'live',
    }
  }

  /**
   * Submit release metadata + queue target stores.
   * Live path: login → content/release/save → addtoqueue.
   * Dry-run: validate + return deterministic dryrun-{releaseId}.
   */
  async submitRelease(release: DistributionRelease): Promise<SubmitReleaseResult> {
    const targets = release.targetStores?.length
      ? release.targetStores
      : []
    const resolved = resolveRevelatorTargetStores(targets)

    if (!release.tracks.length) {
      throw new Error('Release must have at least one track')
    }
    for (const track of release.tracks) {
      if (!track.isrc?.trim()) throw new Error(`Missing ISRC: ${track.title}`)
      if (!track.wavUrl?.trim()) throw new Error(`Missing WAV URL: ${track.title}`)
    }

    if (this.config.dryRun) {
      const releaseId = `dryrun-${release.releaseId}`
      return {
        releaseId,
        dryRun: true,
        queuedStoreIds: resolved.storeIds,
        queuedStores: resolved.queued,
        unsupported: resolved.unsupported,
        message:
          resolved.storeIds.length === 0
            ? 'Dry-run: no curated Revelator store IDs for selected targets — refresh map after partner lookup.'
            : `Dry-run: would queue ${resolved.storeIds.length} Revelator store(s). Set REVELATOR_API_KEY + REVELATOR_PARTNER_USER_ID and REVELATOR_DRY_RUN=0 for live delivery.`,
      }
    }

    const token = await this.getAccessToken()
    const saved = await this.saveRelease(token, release)
    const revelatorReleaseId = String(saved.releaseId || saved.id || '')
    if (!revelatorReleaseId) {
      throw new Error('Revelator did not return a releaseId from /content/release/save')
    }

    if (resolved.storeIds.length) {
      await this.addToQueue(token, revelatorReleaseId, resolved.storeIds)
    }

    return {
      releaseId: revelatorReleaseId,
      dryRun: false,
      queuedStoreIds: resolved.storeIds,
      queuedStores: resolved.queued,
      unsupported: resolved.unsupported,
      message:
        resolved.unsupported.length > 0
          ? `Queued ${resolved.storeIds.length} stores; ${resolved.unsupported.length} Studio target(s) need lookup mapping.`
          : undefined,
    }
  }

  async getStatus(
    revelatorReleaseId: string,
    opts?: { targetStores?: string[] }
  ): Promise<DistributionStatus> {
    if (this.config.dryRun || revelatorReleaseId.startsWith('dryrun-')) {
      const studioId = revelatorReleaseId.replace(/^dryrun-/, '')
      const targets = opts?.targetStores?.length
        ? opts.targetStores
        : ['spotify', 'apple_music', 'youtube_music', 'youtube', 'tiktok', 'instagram']
      const resolved = resolveRevelatorTargetStores(targets)
      return {
        status: 'pending',
        dryRun: true,
        message: `Dry-run status for ${studioId || revelatorReleaseId} — no DSP delivery occurred.`,
        stores: resolved.queued.map((store) => ({
          name: store,
          status: 'pending',
          distributorStoreId:
            resolved.storeIds.find((id) => mapRevelatorStoreIdToDsp(id) === store) ?? undefined,
        })),
      }
    }

    const token = await this.getAccessToken()
    const url = `${this.config.baseUrl}/distribution/release/${encodeURIComponent(revelatorReleaseId)}`
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Revelator status error ${res.status}: ${text.slice(0, 200)}`)
    }
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return normalizeStatusPayload(payload)
  }

  /** GET /common/lookup/stores — account-enabled DSPs. */
  async lookupStores(): Promise<
    Array<{ distributorStoreId: number; name: string; isActive?: boolean; studioStore: DspStoreId | null }>
  > {
    if (this.config.dryRun) {
      return resolveRevelatorTargetStores([
        'spotify',
        'apple_music',
        'youtube_music',
        'youtube',
        'tiktok',
        'instagram',
      ]).storeIds.map((id) => {
        const studioStore = mapRevelatorStoreIdToDsp(id)
        return {
          distributorStoreId: id,
          name: studioStore || String(id),
          isActive: true,
          studioStore,
        }
      })
    }
    const token = await this.getAccessToken()
    const url = `${this.config.baseUrl}/common/lookup/stores?activeOnly=true`
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      throw new Error(`Revelator store lookup failed: ${res.status}`)
    }
    const payload = (await res.json().catch(() => [])) as unknown
    const rows = Array.isArray(payload) ? payload : []
    return rows.map((row) => {
      const record = row as Record<string, unknown>
      const distributorStoreId = Number(record.distributorStoreId ?? record.id ?? 0)
      const name = String(record.name || '')
      return {
        distributorStoreId,
        name,
        isActive: record.isActive !== false,
        studioStore: mapRevelatorStoreIdToDsp(distributorStoreId) || matchLookupStoreName(name),
      }
    })
  }

  buildLoginBody(): { partnerApiKey: string; partnerUserId: string } {
    return {
      partnerApiKey: this.config.apiKey,
      partnerUserId: this.config.partnerUserId,
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token
    }
    const res = await this.fetchImpl(`${this.config.baseUrl}/partner/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(this.buildLoginBody()),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Revelator login failed ${res.status}: ${text.slice(0, 200)}`)
    }
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const token = String(
      payload.accessToken || payload.token || payload.access_token || payload.bearerToken || ''
    )
    if (!token) throw new Error('Revelator login response missing access token')
    const expiresInSec = Number(payload.expiresIn || payload.expires_in || 3600)
    this.tokenCache = {
      token,
      expiresAt: Date.now() + Math.max(60, expiresInSec) * 1000,
    }
    return token
  }

  private async saveRelease(
    token: string,
    release: DistributionRelease
  ): Promise<Record<string, unknown>> {
    const body = {
      release: {
        releaseId: 0,
        name: release.title,
        version: '',
        upc: release.upc || '',
        catalogNumber: '',
        releaseDate: release.releaseDate,
        releaseType:
          release.type === 'album' ? 'Album' : release.type === 'ep' ? 'EP' : 'Single',
        label: release.albumArtist || 'SERGIK',
        artist: release.albumArtist || 'SERGIK',
        coverImageUrl: release.artworkUrl || release.tracks[0]?.artworkUrl || '',
        tracks: release.tracks.map((track, index) => ({
          trackNumber: index + 1,
          name: track.title,
          isrc: track.isrc,
          explicit: track.explicit,
          audioUrl: track.wavUrl,
        })),
        ...(this.config.enterpriseId
          ? { enterpriseId: Number(this.config.enterpriseId) || this.config.enterpriseId }
          : {}),
      },
      externalId: release.releaseId,
    }

    const res = await this.fetchImpl(`${this.config.baseUrl}/content/release/save`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Revelator save release failed ${res.status}: ${text.slice(0, 300)}`)
    }
    return (await res.json().catch(() => ({}))) as Record<string, unknown>
  }

  private async addToQueue(
    token: string,
    revelatorReleaseId: string,
    storeIds: number[]
  ): Promise<void> {
    const url = `${this.config.baseUrl}/distribution/release/addtoqueue?releaseId=${encodeURIComponent(revelatorReleaseId)}`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(storeIds),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Revelator addtoqueue failed ${res.status}: ${text.slice(0, 300)}`)
    }
  }
}

function normalizeStatusPayload(payload: Record<string, unknown>): DistributionStatus {
  const rawStatus = String(payload.status || payload.distributionStatus || 'pending').toLowerCase()
  let status: DistributionStatus['status'] = 'pending'
  if (rawStatus.includes('live') || rawStatus === 'distributed') status = 'live'
  else if (rawStatus.includes('error') || rawStatus.includes('fail')) status = 'error'
  else if (rawStatus.includes('deliver')) status = 'delivered'
  else if (rawStatus.includes('process') || rawStatus.includes('queue')) status = 'processing'
  else if (rawStatus.includes('submit')) status = 'submitted'

  const storesRaw = (payload.stores || payload.storeStatuses || payload.distributions || []) as unknown
  const stores: DistributionStoreStatus[] = []
  if (Array.isArray(storesRaw)) {
    for (const row of storesRaw) {
      const record = row as Record<string, unknown>
      const distributorStoreId = Number(record.distributorStoreId ?? record.storeId ?? 0) || undefined
      const nameFromId = distributorStoreId
        ? mapRevelatorStoreIdToDsp(distributorStoreId)
        : null
      const nameRaw = String(record.name || record.store || record.storeName || '')
      const matched = nameFromId || matchLookupStoreName(nameRaw) || nameRaw
      const url = String(record.url || record.storeUrl || record.link || '').trim() || undefined
      stores.push({
        name: isDspStoreId(String(matched)) ? matched : String(matched),
        url,
        status: String(record.status || status),
        distributorStoreId,
      })
    }
  }

  return {
    status,
    stores,
    message: typeof payload.message === 'string' ? payload.message : undefined,
    dryRun: false,
  }
}

/**
 * Preflight for stream-safe redistribute (used by distribute route).
 */
export function validateSwitchDistributionPayload(release: DistributionRelease): {
  ok: boolean
  blockers: string[]
} {
  const blockers: string[] = []
  if (!release.tracks.length) blockers.push('Add at least one track.')
  for (const track of release.tracks) {
    if (!track.isrc?.trim()) blockers.push(`Missing ISRC: ${track.title}`)
    if (!track.wavUrl?.trim()) blockers.push(`Missing original master WAV: ${track.title}`)
  }
  return { ok: blockers.length === 0, blockers }
}
