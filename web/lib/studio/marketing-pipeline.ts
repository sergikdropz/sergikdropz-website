import type { SupabaseClient } from '@supabase/supabase-js'
import type { CopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { getCopyrightReadinessByReleaseIds } from '@/lib/studio/copyright-pipeline'
import type { MarketingCopy } from '@/lib/studio/constants'
import {
  buildPipelineIntegrationChips,
  summarizePipelineIntegrationAlerts,
  type IntegrationChip,
  type PipelineCollabMeta,
  type PipelineIntegrationAlerts,
} from '@/lib/studio/pipeline-integrations'
import {
  formatScheduleDateLabel,
  listMergedPipelineReleases,
} from '@/lib/studio/schedule-bridge'
import {
  studioCollabHref,
  studioPipelineHref,
  studioReleaseHref,
  workflowStepForActionKind,
} from '@/lib/studio/studio-ia'
import {
  parseSocialPromoPlan,
  summarizeSocialPromo,
  type SocialPromoSummary,
} from '@/lib/studio/social-promo'
import { isReleaseLiveOnStore, type DspVerificationStatus } from '@/lib/studio/dsp-verify'

export type MarketingPhase =
  | 'live'
  | 'needs_launch'
  | 'upcoming'
  | 'date_tbd'
  | 'past_undelivered'

export type MarketingNextAction = {
  label: string
  href: string
  kind:
    | 'campaign'
    | 'smart_link'
    | 'press'
    | 'dsp_connect'
    | 'collab'
    | 'rights'
    | 'launch'
    | 'catalog'
}

export type MarketingPipelineRow = {
  id: string
  title: string
  type: string
  release_date: string | null
  slate_date: string | null
  presave_date: string | null
  genre: string | null
  artwork: string | null
  description: string | null
  source: 'schedule' | 'distribution'
  distributor_status: string | null
  album_artist: string | null
  upc: string | null
  track_count: number
  target_store_count: number
  store_link_count: number
  /** Links with verification_status live or reachable. */
  store_live_count: number
  store_links: Array<{ store: string; url: string; verification_status?: string | null }>
  has_press: boolean
  has_marketing_copy: boolean
  marketing_copy_filled: number
  campaign: { id: string; name: string; status: string } | null
  smart_link_data: { id: string; slug: string; total_clicks: number } | null
  collab: PipelineCollabMeta
  copyright: {
    stage: string
    readiness_score: number
    next_best_action: CopyrightReadiness['next_best_action']
    checks: {
      dsp_ingest_passed: boolean
      contracts_approved: boolean
      ready_to_distribute: boolean
    }
    ugc_pack: CopyrightReadiness['ugc_pack']
    party_contact_count: number
    ingest_blocker: string | null
  } | null
  phase: MarketingPhase
  days_to_release: number | null
  date_label: string
  countdown_label: string
  integrations: IntegrationChip[]
  next_action: MarketingNextAction
  social_promo: SocialPromoSummary
}

export type MarketingPipelineAlerts = PipelineIntegrationAlerts & {
  needs_launch_count: number
  date_tbd_count: number
  upcoming_count: number
  live_count: number
  past_undelivered_count: number
  missing_campaign_count: number
  missing_smart_link_count: number
  missing_press_count: number
  missing_promo_plan_count: number
}

/** Parse YYYY-MM-DD as local calendar day (avoids UTC → Dec 31 shift). */
export function parseLocalDateOnly(value: string | null | undefined): Date | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(year, month, day)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function daysUntilLocalDate(value: string | null | undefined, now = new Date()): number | null {
  const target = parseLocalDateOnly(value)
  if (!target) return null
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function countFilledCopy(copy: MarketingCopy | null | undefined): number {
  if (!copy || typeof copy !== 'object') return 0
  const keys: Array<keyof MarketingCopy> = [
    'elevator_pitch',
    'press_blurb',
    'spotify_pitch',
    'social_caption',
    'store_description',
    'credits_block',
  ]
  return keys.filter((key) => clean(copy[key]).length >= 12).length
}

function hasPressNote(description: string | null | undefined, copyFilled: number): boolean {
  return clean(description).length >= 80 || copyFilled >= 2
}

export function resolveMarketingPhase(input: {
  distributorStatus: string | null | undefined
  releaseDate: string | null | undefined
  hasCampaign: boolean
  hasSmartLink: boolean
  now?: Date
}): MarketingPhase {
  if (input.distributorStatus === 'live') return 'live'
  const days = daysUntilLocalDate(input.releaseDate, input.now)
  if (days === null) return 'date_tbd'
  if (days < 0) return 'past_undelivered'
  if (!input.hasCampaign || !input.hasSmartLink) return 'needs_launch'
  return 'upcoming'
}

export function marketingCountdownLabel(phase: MarketingPhase, days: number | null): string {
  if (phase === 'live') return 'Live'
  if (phase === 'date_tbd') return 'Date TBD'
  if (days === null) return 'Date TBD'
  if (days < 0) return `${Math.abs(days)}d overdue street`
  if (days === 0) return 'Today'
  return `${days}d`
}

export function buildMarketingNextAction(row: {
  id: string
  phase: MarketingPhase
  hasCampaign: boolean
  hasSmartLink: boolean
  hasPress: boolean
  storeLinkCount: number
  storeLiveCount: number
  targetStoreCount: number
  collab: PipelineCollabMeta
  copyright: MarketingPipelineRow['copyright']
}): MarketingNextAction {
  if (row.phase === 'live') {
    if (!row.hasSmartLink) {
      return {
        kind: 'smart_link',
        label: 'Create smart link',
        href: studioPipelineHref('marketing'),
      }
    }
    if (row.storeLiveCount === 0) {
      return {
        kind: 'dsp_connect',
        label:
          row.storeLinkCount > 0
            ? 'Verify live store URLs'
            : 'Connect live store URLs',
        href: studioReleaseHref(row.id, 'delivery'),
      }
    }
    return {
      kind: 'launch',
      label: 'Review launch assets',
      href: studioReleaseHref(row.id, 'launch'),
    }
  }

  if (!row.hasPress) {
    return {
      kind: 'press',
      label: 'Write press / copy',
      href: studioReleaseHref(row.id, 'copy'),
    }
  }

  if (!row.hasCampaign || !row.hasSmartLink) {
    return {
      kind: row.hasCampaign ? 'smart_link' : 'campaign',
      label: !row.hasCampaign && !row.hasSmartLink
        ? 'Launch campaign + smart link'
        : !row.hasCampaign
          ? 'Create campaign'
          : 'Create smart link',
      href: studioPipelineHref('marketing'),
    }
  }

  if (row.storeLiveCount === 0 && row.targetStoreCount > 0) {
    return {
      kind: 'dsp_connect',
      label:
        row.storeLinkCount > 0
          ? `Verify stores (${row.storeLinkCount} linked)`
          : `Connect stores (${row.targetStoreCount} targeted)`,
      href: studioReleaseHref(row.id, 'delivery'),
    }
  }

  if ((row.collab.pendingReviews || 0) > 0) {
    return {
      kind: 'collab',
      label: `Resolve ${row.collab.pendingReviews} collab review(s)`,
      href: studioCollabHref(row.id),
    }
  }

  if (row.copyright && !row.copyright.checks.dsp_ingest_passed) {
    return {
      kind: 'rights',
      label: row.copyright.ingest_blocker || row.copyright.next_best_action.label,
      href: studioReleaseHref(
        row.id,
        workflowStepForActionKind(row.copyright.next_best_action.kind)
      ),
    }
  }

  if (row.phase === 'date_tbd') {
    return {
      kind: 'catalog',
      label: 'Set street date',
      href: studioReleaseHref(row.id, 'metadata'),
    }
  }

  return {
    kind: 'launch',
    label: 'Open launch preflight',
    href: studioReleaseHref(row.id, 'launch'),
  }
}

function parseTargetStores(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item || '').trim()).filter(Boolean)
}

function isActiveMarketingRow(row: MarketingPipelineRow): boolean {
  return row.phase !== 'live'
}

export function summarizeMarketingPipelineAlerts(
  rows: MarketingPipelineRow[]
): MarketingPipelineAlerts {
  const active = rows.filter(isActiveMarketingRow)
  const base = summarizePipelineIntegrationAlerts(
    active.map((row) => ({
      copyright: row.copyright
        ? {
            checks: row.copyright.checks,
            ugc_pack: row.copyright.ugc_pack,
            party_contacts: Array.from({ length: row.copyright.party_contact_count }, () => ({
              stage: 'x',
              email: 'x@y.z',
            })),
            next_best_action: row.copyright.next_best_action,
            ingest: row.copyright.ingest_blocker
              ? { blockers: [row.copyright.ingest_blocker] }
              : { blockers: [] },
          }
        : null,
      storeLinkCount: row.store_link_count,
      storeLiveCount: row.store_live_count,
      targetStoreCount: row.target_store_count,
      collab: row.collab,
      hasCampaign: Boolean(row.campaign),
      hasSmartLink: Boolean(row.smart_link_data),
      distributorStatus: row.distributor_status,
    }))
  )

  return {
    ...base,
    needs_launch_count: rows.filter((r) => r.phase === 'needs_launch').length,
    date_tbd_count: rows.filter((r) => r.phase === 'date_tbd').length,
    upcoming_count: rows.filter((r) => r.phase === 'upcoming').length,
    live_count: rows.filter((r) => r.phase === 'live').length,
    past_undelivered_count: rows.filter((r) => r.phase === 'past_undelivered').length,
    missing_campaign_count: active.filter((r) => !r.campaign).length,
    missing_smart_link_count: active.filter((r) => !r.smart_link_data).length,
    missing_press_count: active.filter((r) => !r.has_press).length,
    missing_promo_plan_count: active.filter((r) => !r.social_promo.has_plan).length,
  }
}

type DistRow = {
  id: string
  title?: string | null
  type?: string | null
  release_date?: string | null
  artwork_url?: string | null
  genre?: string | null
  description?: string | null
  distributor_status?: string | null
  upc?: string | null
  album_artist?: string | null
  target_stores?: unknown
  marketing_copy?: MarketingCopy | null
  social_promo?: unknown
}

function isPlaceholderSlateDate(value: string | null | undefined): boolean {
  return /^\d{4}-01-01$/.test(String(value || '').trim())
}

/**
 * Build the marketing board payload: calendar + distribution truth + integrations.
 */
export async function buildMarketingPipelineBoard(
  supabase: SupabaseClient
): Promise<{ releases: MarketingPipelineRow[]; alerts: MarketingPipelineAlerts }> {
  const baseReleases = await listMergedPipelineReleases(supabase)
  const releaseIds = baseReleases.map((r) => r.id)

  const [
    distResultRaw,
    campaignsResult,
    smartLinksResult,
    storeLinksResultRaw,
    tracksResult,
    readinessByRelease,
    collabsResult,
    reviewsResult,
  ] = await Promise.all([
    releaseIds.length
      ? supabase
          .from('distribution_releases')
          .select(
            'id, title, type, release_date, artwork_url, genre, description, distributor_status, upc, album_artist, target_stores, marketing_copy, social_promo'
          )
          .in('id', releaseIds)
      : Promise.resolve({ data: [] as DistRow[], error: null }),
    releaseIds.length
      ? supabase.from('campaigns').select('id, name, status, release_id').in('release_id', releaseIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string; release_id: string }> }),
    releaseIds.length
      ? supabase
          .from('smartlinks')
          .select('id, slug, total_clicks, release_id')
          .in('release_id', releaseIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; slug: string; total_clicks: number; release_id: string }>,
        }),
    releaseIds.length
      ? supabase
          .from('distribution_store_links')
          .select('release_id, store, url, verification_status')
          .in('release_id', releaseIds)
      : Promise.resolve({
          data: [] as Array<{
            release_id: string
            store: string
            url: string
            verification_status?: string | null
          }>,
        }),
    releaseIds.length
      ? supabase.from('distribution_tracks').select('release_id').in('release_id', releaseIds)
      : Promise.resolve({ data: [] as Array<{ release_id: string }> }),
    getCopyrightReadinessByReleaseIds(supabase, releaseIds),
    releaseIds.length
      ? supabase.from('release_collaborators').select('release_id').in('release_id', releaseIds)
      : Promise.resolve({ data: [] as Array<{ release_id: string }>, error: null }),
    releaseIds.length
      ? supabase
          .from('release_collab_reviews')
          .select('release_id,status')
          .in('release_id', releaseIds)
      : Promise.resolve({
          data: [] as Array<{ release_id: string; status: string }>,
          error: null,
        }),
  ])

  let distResult = distResultRaw
  if (distResultRaw && 'error' in distResultRaw && distResultRaw.error && /social_promo/i.test(String(distResultRaw.error.message || ''))) {
    distResult = await supabase
      .from('distribution_releases')
      .select(
        'id, title, type, release_date, artwork_url, genre, description, distributor_status, upc, album_artist, target_stores, marketing_copy'
      )
      .in('id', releaseIds)
  }

  let storeLinksResult = storeLinksResultRaw
  if (
    storeLinksResultRaw &&
    'error' in storeLinksResultRaw &&
    storeLinksResultRaw.error &&
    /verification_status/i.test(String(storeLinksResultRaw.error.message || ''))
  ) {
    storeLinksResult = await supabase
      .from('distribution_store_links')
      .select('release_id, store, url')
      .in('release_id', releaseIds)
  }

  const distById = new Map<string, DistRow>()
  for (const row of (distResult.data || []) as DistRow[]) {
    distById.set(String(row.id), row)
  }

  const campaignsByRelease: Record<string, { id: string; name: string; status: string }> = {}
  for (const c of campaignsResult.data || []) {
    if (c.release_id) campaignsByRelease[c.release_id] = c
  }

  const smartLinksByRelease: Record<string, { id: string; slug: string; total_clicks: number }> = {}
  for (const s of smartLinksResult.data || []) {
    if (s.release_id) {
      smartLinksByRelease[s.release_id] = {
        id: s.id,
        slug: s.slug,
        total_clicks: s.total_clicks || 0,
      }
    }
  }

  const storeLinksByRelease = new Map<
    string,
    Array<{ store: string; url: string; verification_status?: string | null }>
  >()
  for (const row of storeLinksResult.data || []) {
    const id = String(row.release_id)
    const list = storeLinksByRelease.get(id) || []
    list.push({
      store: String(row.store || ''),
      url: String(row.url || ''),
      verification_status: row.verification_status ?? null,
    })
    storeLinksByRelease.set(id, list)
  }

  const trackCountByRelease = new Map<string, number>()
  for (const row of tracksResult.data || []) {
    const id = String(row.release_id)
    trackCountByRelease.set(id, (trackCountByRelease.get(id) || 0) + 1)
  }

  const collabByRelease = new Map<string, PipelineCollabMeta>()
  if (!('error' in collabsResult && collabsResult.error)) {
    for (const row of collabsResult.data || []) {
      const id = String(row.release_id)
      const current = collabByRelease.get(id) || { collaboratorCount: 0, pendingReviews: 0 }
      current.collaboratorCount += 1
      collabByRelease.set(id, current)
    }
  }
  if (!('error' in reviewsResult && reviewsResult.error)) {
    for (const row of reviewsResult.data || []) {
      if (String(row.status) !== 'pending') continue
      const id = String(row.release_id)
      const current = collabByRelease.get(id) || { collaboratorCount: 0, pendingReviews: 0 }
      current.pendingReviews += 1
      collabByRelease.set(id, current)
    }
  }

  const releases: MarketingPipelineRow[] = baseReleases.map((base) => {
    const dist = distById.get(base.id)
    const campaign = campaignsByRelease[base.id]
      ? {
          id: campaignsByRelease[base.id]!.id,
          name: campaignsByRelease[base.id]!.name,
          status: campaignsByRelease[base.id]!.status,
        }
      : null
    const smart_link_data = smartLinksByRelease[base.id] || null
    const store_links = storeLinksByRelease.get(base.id) || []
    const store_live_count = store_links.filter((l) =>
      isReleaseLiveOnStore(l.verification_status as DspVerificationStatus)
    ).length
    const targetStores = parseTargetStores(dist?.target_stores ?? base.target_stores)
    const copyFilled = countFilledCopy(dist?.marketing_copy || null)
    const description = dist?.description || base.description || null
    const has_press = hasPressNote(description, copyFilled)
    const copyrightRaw = readinessByRelease[base.id] || null
    const collab = collabByRelease.get(base.id) || {
      collaboratorCount: 0,
      pendingReviews: 0,
    }
    const distributor_status =
      dist?.distributor_status || base.distributor_status || null
    // Street date prefers distribution. Fall back to slate only when it is not a Jan-1 placeholder.
    const slate_date = base.slate_date || null
    const release_date = dist
      ? dist.release_date ||
        (!isPlaceholderSlateDate(slate_date) ? slate_date : null) ||
        null
      : base.release_date || null
    const days_to_release = daysUntilLocalDate(release_date)
    const phase = resolveMarketingPhase({
      distributorStatus: distributor_status,
      releaseDate: release_date,
      hasCampaign: Boolean(campaign),
      hasSmartLink: Boolean(smart_link_data),
    })
    const copyright = copyrightRaw
      ? {
          stage: copyrightRaw.stage,
          readiness_score: copyrightRaw.readiness_score,
          next_best_action: copyrightRaw.next_best_action,
          checks: {
            dsp_ingest_passed: copyrightRaw.checks.dsp_ingest_passed,
            contracts_approved: copyrightRaw.checks.contracts_approved,
            ready_to_distribute: copyrightRaw.checks.ready_to_distribute,
          },
          ugc_pack: copyrightRaw.ugc_pack,
          party_contact_count: copyrightRaw.party_contacts?.length || 0,
          ingest_blocker: copyrightRaw.ingest?.blockers?.[0] || null,
        }
      : null

    const integrations = buildPipelineIntegrationChips({
      copyright: copyrightRaw,
      storeLinkCount: store_links.length,
      storeLiveCount: store_live_count,
      targetStoreCount: targetStores.length,
      collab,
      hasCampaign: Boolean(campaign),
      hasSmartLink: Boolean(smart_link_data),
      distributorStatus: distributor_status,
      hasPress: has_press,
      copyFilled,
    })

    const next_action = buildMarketingNextAction({
      id: base.id,
      phase,
      hasCampaign: Boolean(campaign),
      hasSmartLink: Boolean(smart_link_data),
      hasPress: has_press,
      storeLinkCount: store_links.length,
      storeLiveCount: store_live_count,
      targetStoreCount: targetStores.length,
      collab,
      copyright,
    })

    return {
      id: base.id,
      title: dist?.title || base.title,
      type: dist?.type || base.type,
      release_date,
      slate_date,
      presave_date: base.presave_date,
      genre: dist?.genre || base.genre,
      artwork: dist?.artwork_url || base.artwork,
      description,
      source: base.source,
      distributor_status,
      album_artist: dist?.album_artist || null,
      upc: dist?.upc || null,
      track_count: trackCountByRelease.get(base.id) || 0,
      target_store_count: targetStores.length,
      store_link_count: store_links.length,
      store_live_count,
      store_links: store_links.slice(0, 8),
      has_press,
      has_marketing_copy: copyFilled > 0,
      marketing_copy_filled: copyFilled,
      campaign,
      smart_link_data,
      collab,
      copyright,
      phase,
      days_to_release,
      date_label: formatScheduleDateLabel(release_date),
      countdown_label: marketingCountdownLabel(phase, days_to_release),
      integrations,
      next_action,
      social_promo: summarizeSocialPromo(parseSocialPromoPlan(dist?.social_promo)),
    }
  })

  releases.sort((a, b) => {
    const phaseRank: Record<MarketingPhase, number> = {
      needs_launch: 0,
      upcoming: 1,
      past_undelivered: 2,
      date_tbd: 3,
      live: 4,
    }
    const rank = phaseRank[a.phase] - phaseRank[b.phase]
    if (rank !== 0) return rank
    const da = a.days_to_release ?? 9999
    const db = b.days_to_release ?? 9999
    return da - db
  })

  return {
    releases,
    alerts: summarizeMarketingPipelineAlerts(releases),
  }
}
