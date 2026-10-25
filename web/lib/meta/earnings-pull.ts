import { graphGet, MetaGraphError } from '@/lib/meta/graph'
import {
  adInsightsToCsv,
  creatorEarningAmount,
  creatorEarningsToCsv,
  type AdInsightRow,
  type CreatorEarningPoint,
} from '@/lib/studio/royalties/pull-csv'

export const META_ADS_PULL_KEY = 'meta_ads:last_30d'
export const META_CREATOR_PULL_KEY = 'meta_creator:last_28d'
export const META_CREATOR_IG_PULL_KEY = 'meta_creator_instagram:last_28d'

type InsightsPage = {
  data?: AdInsightRow[]
  paging?: { next?: string }
}

type PageInsightBody = {
  data?: Array<{
    name?: string
    values?: Array<{ value?: unknown; end_time?: string }>
  }>
}

export function adAccountPath(rawId: string): string | null {
  const id = rawId.trim()
  if (!id) return null
  const act = id.startsWith('act_') ? id : `act_${id.replace(/^act_/, '')}`
  if (!/^act_\d+$/.test(act)) return null
  return `/${act}/insights`
}

export async function listMetaAdAccounts(userToken: string): Promise<Array<{ id: string; name: string }>> {
  const body = await graphGet<{ data?: Array<{ id?: string; name?: string }> }>('/me/adaccounts', userToken, {
    fields: 'id,name',
    limit: '25',
  })
  return (body.data || [])
    .filter((row) => typeof row.id === 'string' && /^act_\d+$/.test(row.id))
    .map((row) => ({ id: row.id as string, name: (row.name || row.id || '').trim() }))
}

/** Env id, otherwise the only account, otherwise an account whose name contains SERGIK. */
export async function resolveMetaAdAccountId(userToken: string): Promise<{ id: string | null; note: string }> {
  const envId = (process.env.META_AD_ACCOUNT_ID || '').trim()
  if (envId) return { id: envId, note: 'Using META_AD_ACCOUNT_ID.' }
  const accounts = await listMetaAdAccounts(userToken)
  if (accounts.length === 1) return { id: accounts[0].id, note: `Using the only ad account, ${accounts[0].name}.` }
  const named = accounts.find((account) => /sergik/i.test(account.name))
  if (named) return { id: named.id, note: `Using the SERGIK ad account, ${named.name}.` }
  if (!accounts.length) return { id: null, note: 'This Meta token has no ad account.' }
  return {
    id: null,
    note: `This token has ${accounts.length} ad accounts. Set META_AD_ACCOUNT_ID to the one that should be pulled.`,
  }
}

export async function pullMetaAdSpendCsv(input: {
  userToken: string
  adAccountId: string
}): Promise<{ csv: string; truncated: boolean }> {
  const path = adAccountPath(input.adAccountId)
  if (!path) throw new Error('META_AD_ACCOUNT_ID must look like act_123 or 123.')
  const page = await graphGet<InsightsPage>(path, input.userToken, {
    level: 'adset',
    fields: 'campaign_name,adset_name,spend,impressions,account_currency,date_start,date_stop',
    date_preset: 'last_30d',
    limit: '200',
  })
  const rows = Array.isArray(page.data) ? page.data : []
  return {
    csv: adInsightsToCsv(rows),
    truncated: Boolean(page.paging?.next),
  }
}

function insightPoints(body: PageInsightBody): CreatorEarningPoint[] {
  const series = (body.data || []).find((row) => row.name === 'content_monetization_earnings')
  return (series?.values || []).map((point) => ({
    endTime: point.end_time || '',
    amount: creatorEarningAmount(point.value),
  }))
}

export async function pullMetaCreatorCsv(input: {
  pageToken: string
  pageId: string
  since: string
  until: string
}): Promise<{ csv: string; skipped: number; windowCents: number; dayCount: number }> {
  const body = await graphGet<PageInsightBody>(`/${input.pageId}/insights`, input.pageToken, {
    metric: 'content_monetization_earnings',
    period: 'day',
    since: input.since,
    until: input.until,
  })
  return creatorEarningsToCsv({ pageId: input.pageId, currency: 'USD', points: insightPoints(body) })
}

/** Instagram professional-account insights. Earnings are not a supported metric, so that response finishes empty. */
export async function pullInstagramCreatorCsv(input: {
  userToken: string
  igUserId: string
  since: string
  until: string
}): Promise<{ csv: string; skipped: number; windowCents: number; dayCount: number; unavailable: boolean }> {
  try {
    const body = await graphGet<PageInsightBody>(`/${input.igUserId}/insights`, input.userToken, {
      metric: 'content_monetization_earnings',
      period: 'day',
      since: input.since,
      until: input.until,
    })
    return {
      ...creatorEarningsToCsv({
        pageId: input.igUserId,
        currency: 'USD',
        store: 'Instagram',
        points: insightPoints(body),
      }),
      unavailable: false,
    }
  } catch (error) {
    if (error instanceof MetaGraphError && error.code === 100) {
      return {
        csv: 'Page ID,Store,Approximate earnings,Currency,Reporting Date\n',
        skipped: 0,
        windowCents: 0,
        dayCount: 0,
        unavailable: true,
      }
    }
    throw error
  }
}

export function creatorWindow(now = new Date()): { since: string; until: string } {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const since = new Date(until.getTime() - 28 * 24 * 60 * 60 * 1000)
  return { since: unixSeconds(since), until: unixSeconds(until) }
}

function unixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000))
}
