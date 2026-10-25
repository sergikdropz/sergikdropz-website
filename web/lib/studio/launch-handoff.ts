import type { SupabaseClient } from '@supabase/supabase-js'
import { RELEASE_CAMPAIGN_TEMPLATE } from '@/lib/campaign-builder'

export type LaunchHandoffCampaign = {
  id: string
  name: string
  status: string
  reused: boolean
  scheduled_send_at?: string | null
}

export type LaunchHandoffSmartLink = {
  id: string
  slug: string
  total_clicks: number
  reused: boolean
  destination_url?: string | null
  /** True when an existing placeholder link was pointed at a real store URL. */
  refreshed?: boolean
}

export type LaunchHandoffResult = {
  campaign: LaunchHandoffCampaign | null
  smartLink: LaunchHandoffSmartLink | null
  errors: string[]
}

export type LaunchHandoffStatus = {
  campaign: { id: string; name: string; status: string; scheduled_send_at?: string | null } | null
  smartLink: { id: string; slug: string; total_clicks: number; destination_url?: string | null } | null
}

export type EnsureLaunchHandoffInput = {
  releaseId: string
  title: string
  releaseDate?: string | null
  /** Prefer Spotify (or any) store URL; falls back to public /music/:id */
  destinationUrl?: string | null
  createdBy?: string | null
  createCampaign?: boolean
  createSmartLink?: boolean
}

export function smartLinkKindForDate(releaseDate?: string | null, now: Date = new Date()): 'presave' | 'listen' {
  const raw = String(releaseDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'listen'
  const [year, month, day] = raw.split('-').map(Number)
  const street = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return street.getTime() > today.getTime() ? 'presave' : 'listen'
}

export function smartLinkSlugForRelease(releaseId: string, kind: 'presave' | 'listen' = 'presave'): string {
  const safe = releaseId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${kind}-${safe || 'release'}`
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').replace(/\/$/, '')
}

export function publicSmartLinkUrl(slug: string): string {
  return `${siteOrigin()}/l/${encodeURIComponent(slug)}`
}

/** True when the link still points at the on-site music page instead of a store. */
export function isFallbackMusicDestination(url: string | null | undefined, releaseId: string): boolean {
  const raw = String(url || '').trim()
  if (!raw) return true
  try {
    const path = decodeURIComponent(new URL(raw).pathname).replace(/\/$/, '')
    return path === `/music/${releaseId}`
  } catch {
    return true
  }
}

/** Noon Pacific on the street date, stored as UTC. Drafts are not sent until scheduled. */
export function campaignScheduledSendAt(releaseDate?: string | null): string | null {
  const raw = String(releaseDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return `${raw}T20:00:00.000Z`
}

export function campaignHandoffDescription(input: { title: string; smartUrl?: string | null }): string {
  const title = input.title.trim() || 'this release'
  const link = input.smartUrl?.trim()
  return [
    `Release week draft for ${title}.`,
    link ? `Fan link: ${link}` : 'Fan link: create the smart link before sending.',
    'Sequence: T-3 teaser, street-day announcement, T+2 reminder, T+7 follow-up.',
    'Stays a draft until you schedule it in Campaigns.',
  ].join('\n')
}

function httpDestination(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function publicMusicDestinationUrl(
  releaseId: string,
  storeLinks?: Array<{ store?: string | null; url?: string | null }> | null
): string {
  const preferred =
    storeLinks?.find((l) => l.store === 'spotify' && l.url?.trim()) ||
    storeLinks?.find((l) => Boolean(l.url?.trim()))
  if (preferred?.url?.trim()) {
    const checked = httpDestination(preferred.url.trim())
    if (checked) return checked
  }

  return `${siteOrigin()}/music/${encodeURIComponent(releaseId)}`
}

/**
 * Idempotent campaign + smart link for a release.
 * Partial failures stay in errors[] instead of throwing.
 * A draft campaign is never marked scheduled. A placeholder smart link is
 * moved to a store URL when one exists. Shared slugs are not renamed.
 */
export async function ensureLaunchHandoff(
  supabase: SupabaseClient,
  input: EnsureLaunchHandoffInput
): Promise<LaunchHandoffResult> {
  const createCampaign = input.createCampaign !== false
  const createSmartLink = input.createSmartLink !== false
  const errors: string[] = []
  let campaign: LaunchHandoffCampaign | null = null
  let smartLink: LaunchHandoffSmartLink | null = null
  const kind = smartLinkKindForDate(input.releaseDate)
  let destination =
    httpDestination(input.destinationUrl?.trim() || '') || publicMusicDestinationUrl(input.releaseId)
  if (isFallbackMusicDestination(destination, input.releaseId)) {
    const { data: storeRows } = await supabase
      .from('distribution_store_links')
      .select('store, url')
      .eq('release_id', input.releaseId)
    if (storeRows?.length) {
      const fromStores = publicMusicDestinationUrl(input.releaseId, storeRows)
      if (!isFallbackMusicDestination(fromStores, input.releaseId)) destination = fromStores
    }
  }
  const title = input.title.trim() || 'Release'
  const sendAt = campaignScheduledSendAt(input.releaseDate)

  if (createSmartLink) {
    const { data: existingLink, error: loadError } = await supabase
      .from('smartlinks')
      .select('id, slug, total_clicks, destination_url, title')
      .eq('release_id', input.releaseId)
      .limit(1)

    if (loadError) {
      errors.push(loadError.message)
    } else if (existingLink?.[0]) {
      const row = existingLink[0]
      let destinationUrl = String(row.destination_url || '')
      let refreshed = false
      const placeholder = isFallbackMusicDestination(destinationUrl, input.releaseId)
      const better = !isFallbackMusicDestination(destination, input.releaseId)
      if (placeholder && better) {
        const { error: updateError } = await supabase
          .from('smartlinks')
          .update({
            destination_url: destination,
            title: `${kind === 'presave' ? 'Pre-save' : 'Listen'}: ${title}`,
          })
          .eq('id', row.id)
        if (updateError) {
          errors.push(updateError.message)
        } else {
          destinationUrl = destination
          refreshed = true
        }
      }
      smartLink = {
        id: row.id,
        slug: row.slug,
        total_clicks: row.total_clicks || 0,
        destination_url: destinationUrl,
        reused: true,
        refreshed,
      }
    } else {
      const base = smartLinkSlugForRelease(input.releaseId, kind)
      let created: { id: string; slug: string; total_clicks: number | null } | null = null
      let lastError = 'Failed to create smart link'
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
        const { data, error } = await supabase
          .from('smartlinks')
          .insert([
            {
              slug,
              title: `${kind === 'presave' ? 'Pre-save' : 'Listen'}: ${title}`,
              destination_url: destination,
              category: 'release',
              release_id: input.releaseId,
              description: '',
              metadata: { kind },
              created_by: input.createdBy || null,
            },
          ])
          .select('id, slug, total_clicks')
        if (!error && data?.[0]) {
          created = data[0]
          break
        }
        lastError = error?.code === '23505' ? 'Smart link slug already exists' : error?.message || lastError
        if (error?.code !== '23505') break
      }
      if (!created) {
        errors.push(lastError)
      } else {
        smartLink = {
          id: created.id,
          slug: created.slug,
          total_clicks: created.total_clicks || 0,
          destination_url: destination,
          reused: false,
        }
      }
    }
  }

  if (createCampaign) {
    const fanUrl = smartLink?.slug ? publicSmartLinkUrl(smartLink.slug) : null
    const description = campaignHandoffDescription({ title, smartUrl: fanUrl })
    const { data: existingCampaign, error: loadError } = await supabase
      .from('campaigns')
      .select('id, name, status, scheduled_send_at, description')
      .eq('release_id', input.releaseId)
      .limit(1)

    if (loadError) {
      errors.push(loadError.message)
    } else if (existingCampaign?.[0]) {
      const row = existingCampaign[0]
      let scheduled = row.scheduled_send_at ? String(row.scheduled_send_at) : null
      const current = String(row.description || '')
      const draft = String(row.status || '').toLowerCase() === 'draft'
      const owned =
        !current.trim() ||
        current === RELEASE_CAMPAIGN_TEMPLATE.description ||
        current.startsWith('Release week draft')
      const missingLink = Boolean(fanUrl && !current.includes(String(fanUrl)))
      if (draft && owned && (missingLink || !scheduled)) {
        const nextSend = scheduled || sendAt
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            description,
            scheduled_send_at: nextSend,
          })
          .eq('id', row.id)
        if (updateError) errors.push(updateError.message)
        else scheduled = nextSend
      }
      campaign = {
        id: row.id,
        name: row.name,
        status: row.status,
        scheduled_send_at: scheduled,
        reused: true,
      }
    } else {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([
          {
            name: `${title} - Release Campaign`,
            release_id: input.releaseId,
            description,
            scheduled_send_at: sendAt,
            status: 'draft',
            created_by: input.createdBy || null,
          },
        ])
        .select('id, name, status, scheduled_send_at')

      if (error || !data?.[0]) {
        errors.push(error?.message || 'Failed to create campaign')
      } else {
        campaign = {
          id: data[0].id,
          name: data[0].name,
          status: data[0].status,
          scheduled_send_at: data[0].scheduled_send_at,
          reused: false,
        }
      }
    }
  }

  return { campaign, smartLink, errors }
}

export async function getLaunchHandoffStatus(
  supabase: SupabaseClient,
  releaseId: string
): Promise<LaunchHandoffStatus> {
  const [campaignsResult, smartLinksResult] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, status, scheduled_send_at')
      .eq('release_id', releaseId)
      .limit(1),
    supabase
      .from('smartlinks')
      .select('id, slug, total_clicks, destination_url')
      .eq('release_id', releaseId)
      .limit(1),
  ])

  const campaignRow = campaignsResult.data?.[0]
  const linkRow = smartLinksResult.data?.[0]
  return {
    campaign: campaignRow
      ? {
          id: campaignRow.id,
          name: campaignRow.name,
          status: campaignRow.status,
          scheduled_send_at: campaignRow.scheduled_send_at,
        }
      : null,
    smartLink: linkRow
      ? {
          id: linkRow.id,
          slug: linkRow.slug,
          total_clicks: linkRow.total_clicks || 0,
          destination_url: linkRow.destination_url,
        }
      : null,
  }
}
