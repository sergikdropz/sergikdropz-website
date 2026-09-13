import type { SupabaseClient } from '@supabase/supabase-js'
import { RELEASE_CAMPAIGN_TEMPLATE } from '@/lib/campaign-builder'

export type LaunchHandoffCampaign = {
  id: string
  name: string
  status: string
  reused: boolean
}

export type LaunchHandoffSmartLink = {
  id: string
  slug: string
  total_clicks: number
  reused: boolean
}

export type LaunchHandoffResult = {
  campaign: LaunchHandoffCampaign | null
  smartLink: LaunchHandoffSmartLink | null
  errors: string[]
}

export type LaunchHandoffStatus = {
  campaign: { id: string; name: string; status: string } | null
  smartLink: { id: string; slug: string; total_clicks: number } | null
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

export function smartLinkSlugForRelease(releaseId: string): string {
  const safe = releaseId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `presave-${safe || 'release'}`
}

export function publicMusicDestinationUrl(
  releaseId: string,
  storeLinks?: Array<{ store?: string | null; url?: string | null }> | null
): string {
  const preferred =
    storeLinks?.find((l) => l.store === 'spotify' && l.url?.trim()) ||
    storeLinks?.find((l) => Boolean(l.url?.trim()))
  if (preferred?.url?.trim()) return preferred.url.trim()

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').replace(/\/$/, '')
  return `${base}/music/${encodeURIComponent(releaseId)}`
}

/**
 * Idempotent campaign + smart link creation for a release (schedule or distribution).
 * Never throws for partial failures — returns errors[] instead.
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

  if (createCampaign) {
    const { data: existingCampaign } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('release_id', input.releaseId)
      .limit(1)

    if (existingCampaign?.[0]) {
      campaign = { ...existingCampaign[0], reused: true }
    } else {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([
          {
            name: `${input.title} - Release Campaign`,
            release_id: input.releaseId,
            description: RELEASE_CAMPAIGN_TEMPLATE.description,
            scheduled_send_at: input.releaseDate
              ? new Date(input.releaseDate).toISOString()
              : null,
            status: 'draft',
            created_by: input.createdBy || null,
          },
        ])
        .select('id, name, status')

      if (error || !data?.[0]) {
        errors.push(error?.message || 'Failed to create campaign')
      } else {
        campaign = { ...data[0], reused: false }
      }
    }
  }

  if (createSmartLink) {
    const { data: existingLink } = await supabase
      .from('smartlinks')
      .select('id, slug, total_clicks')
      .eq('release_id', input.releaseId)
      .limit(1)

    if (existingLink?.[0]) {
      smartLink = {
        id: existingLink[0].id,
        slug: existingLink[0].slug,
        total_clicks: existingLink[0].total_clicks || 0,
        reused: true,
      }
    } else {
      const slug = smartLinkSlugForRelease(input.releaseId)
      const destinationUrl =
        input.destinationUrl?.trim() || publicMusicDestinationUrl(input.releaseId)

      const { data, error } = await supabase
        .from('smartlinks')
        .insert([
          {
            slug,
            title: `Pre-save: ${input.title}`,
            destination_url: destinationUrl,
            category: 'release',
            release_id: input.releaseId,
            description: '',
            metadata: {},
            created_by: input.createdBy || null,
          },
        ])
        .select('id, slug, total_clicks')

      if (error || !data?.[0]) {
        if (error?.code === '23505') {
          errors.push('Smart link slug already exists')
        } else {
          errors.push(error?.message || 'Failed to create smart link')
        }
      } else {
        smartLink = {
          id: data[0].id,
          slug: data[0].slug,
          total_clicks: data[0].total_clicks || 0,
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
      .select('id, name, status')
      .eq('release_id', releaseId)
      .limit(1),
    supabase
      .from('smartlinks')
      .select('id, slug, total_clicks')
      .eq('release_id', releaseId)
      .limit(1),
  ])

  return {
    campaign: campaignsResult.data?.[0] || null,
    smartLink: smartLinksResult.data?.[0]
      ? {
          id: smartLinksResult.data[0].id,
          slug: smartLinksResult.data[0].slug,
          total_clicks: smartLinksResult.data[0].total_clicks || 0,
        }
      : null,
  }
}
