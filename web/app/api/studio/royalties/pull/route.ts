import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { MetaGraphError } from '@/lib/meta/graph'
import { loadMetaRoyaltyAccess } from '@/lib/meta/connection'
import {
  META_ADS_PULL_KEY,
  META_CREATOR_IG_PULL_KEY,
  META_CREATOR_PULL_KEY,
  creatorWindow,
  pullInstagramCreatorCsv,
  pullMetaAdSpendCsv,
  pullMetaCreatorCsv,
  resolveMetaAdAccountId,
} from '@/lib/meta/earnings-pull'
import { INSTAGRAM_EARNINGS_UNAVAILABLE_NOTE } from '@/lib/studio/royalties/pull-csv'
import { ingestRoyaltyStatement, readRoyaltyStore, writeRoyaltyStore } from '@/lib/studio/royalties'
import { loadTrackSplitLookup } from '@/lib/studio/royalties/track-lookup'

export const dynamic = 'force-dynamic'

const DISTROKID_REASON =
  'DistroKid has no earnings API. In Admin AI, run admin_browser distrokid_bank_import on the Chromium desk after you are signed in. That reads a CSV link already on the bank page. It does not click Continue, Submit, or Let\'s do it. A file you download yourself can still be ingested here.'

function scopeMissing(scopes: string[], required: string): boolean {
  return scopes.length > 0 && !scopes.includes(required)
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const access = await loadMetaRoyaltyAccess()
  const scopes = access?.scopes || []
  const adsConnected = Boolean(access?.userToken && !scopeMissing(scopes, 'ads_read'))
  let adsReady = adsConnected
  let adsReason = !access?.userToken
    ? 'Connect Meta before ad spend can be pulled.'
    : scopeMissing(scopes, 'ads_read')
      ? 'Reconnect Meta with ads earnings so the token includes ads_read.'
      : 'Pulls the last 30 days of ad-set spend. A new pull replaces the previous snapshot.'
  if (adsConnected && access?.userToken) {
    try {
      const account = await resolveMetaAdAccountId(access.userToken)
      if (account.id) {
        adsReason = `${account.note} Pulls the last 30 days of ad-set spend. A new pull replaces the previous snapshot.`
      } else {
        adsReady = false
        adsReason = account.note
      }
    } catch (error) {
      adsReady = false
      adsReason = error instanceof MetaGraphError ? error.message : 'The ad account on this token could not be read.'
    }
  }
  return NextResponse.json({
    distrokid: { mode: 'csv', ready: false, reason: DISTROKID_REASON },
    metaAds: {
      mode: 'graph',
      ready: adsReady,
      reason: adsReason,
    },
    metaCreator: {
      mode: 'graph',
      ready: Boolean(access?.pageToken && access.pageId && !scopeMissing(scopes, 'read_insights')),
      reason: !access?.pageToken
        ? 'Connect Meta before Facebook creator earnings can be pulled.'
        : scopeMissing(scopes, 'read_insights')
          ? 'Reconnect Meta with ads earnings so the token includes read_insights.'
          : 'Facebook Page content monetization for the last 28 days. Approximate, and separate from the Instagram account.',
    },
    metaCreatorInstagram: {
      mode: 'graph',
      ready: Boolean(access?.userToken && access.igUserId && !scopeMissing(scopes, 'instagram_manage_insights')),
      reason: !access?.userToken || !access?.igUserId
        ? 'Connect Meta before Instagram creator earnings can be pulled.'
        : scopeMissing(scopes, 'instagram_manage_insights')
          ? 'Reconnect Meta and allow Instagram insights. The Facebook Page series does not include this account.'
          : 'Instagram insights are connected. Professional-account insights have no earnings metric, so the pull finishes without writing rows. Facebook Page content monetization stays on its own button.',
    },
    connectPath: '/api/studio/meta/connect?earnings=1&next=/studio/royalties',
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const source =
    body?.source === 'meta_ads' || body?.source === 'meta_creator' || body?.source === 'meta_creator_instagram'
      ? body.source
      : null
  if (!source) {
    return NextResponse.json({ error: 'source must be meta_ads, meta_creator, or meta_creator_instagram' }, { status: 400 })
  }
  if (body?.source === 'distrokid') {
    return NextResponse.json({ error: DISTROKID_REASON }, { status: 400 })
  }

  const access = await loadMetaRoyaltyAccess()
  if (!access) {
    return NextResponse.json({ error: 'Connect Meta first.' }, { status: 409 })
  }

  try {
    let csv = ''
    let filename = ''
    let notes = ''
    let externalKey = ''
    let windowCents = 0
    let dayCount = 0
    const warnings: string[] = []

    if (source === 'meta_ads') {
      if (!access.userToken) return NextResponse.json({ error: 'Meta user token is missing. Reconnect Meta.' }, { status: 409 })
      if (scopeMissing(access.scopes, 'ads_read')) {
        return NextResponse.json({ error: 'The Meta token is missing ads_read. Reconnect with ads earnings.' }, { status: 409 })
      }
      const account = await resolveMetaAdAccountId(access.userToken)
      if (!account.id) return NextResponse.json({ error: account.note }, { status: 409 })
      const pulled = await pullMetaAdSpendCsv({ userToken: access.userToken, adAccountId: account.id })
      csv = pulled.csv
      if (pulled.truncated) warnings.push('Meta returned more than 200 ad sets. This pull kept the first page.')
      filename = 'meta-ads-last-30d.csv'
      notes = 'Pulled from Meta Ads Insights. Spend is a cost, not income.'
      externalKey = META_ADS_PULL_KEY
    } else if (source === 'meta_creator') {
      if (!access.pageToken || !access.pageId) {
        return NextResponse.json({ error: 'Meta Page token is missing. Reconnect Meta.' }, { status: 409 })
      }
      if (scopeMissing(access.scopes, 'read_insights')) {
        return NextResponse.json({ error: 'The Meta token is missing read_insights. Reconnect with ads earnings.' }, { status: 409 })
      }
      const window = creatorWindow()
      const pulled = await pullMetaCreatorCsv({
        pageToken: access.pageToken,
        pageId: access.pageId,
        since: window.since,
        until: window.until,
      })
      csv = pulled.csv
      windowCents = pulled.windowCents
      dayCount = pulled.dayCount
      if (pulled.skipped) warnings.push(`${pulled.skipped} creator rows were skipped because the amount was missing or not a currency unit.`)
      filename = 'meta-creator-last-28d.csv'
      notes = 'Approximate Facebook content monetization from Page insights. Not a bank statement.'
      externalKey = META_CREATOR_PULL_KEY
    } else {
      if (!access.userToken || !access.igUserId) {
        return NextResponse.json({ error: 'The Instagram professional account is not on this Meta connection. Reconnect Meta.' }, { status: 409 })
      }
      if (scopeMissing(access.scopes, 'instagram_manage_insights')) {
        return NextResponse.json(
          { error: 'Reconnect Meta and allow Instagram insights. The Facebook Page series does not include this account.' },
          { status: 409 },
        )
      }
      const window = creatorWindow()
      const pulled = await pullInstagramCreatorCsv({
        userToken: access.userToken,
        igUserId: access.igUserId,
        since: window.since,
        until: window.until,
      })
      if (pulled.unavailable) {
        return NextResponse.json({
          ok: true,
          duplicate: false,
          replaced: false,
          lineCount: 0,
          note: INSTAGRAM_EARNINGS_UNAVAILABLE_NOTE,
          warnings: [],
        })
      }
      csv = pulled.csv
      windowCents = pulled.windowCents
      dayCount = pulled.dayCount
      if (pulled.skipped) warnings.push(`${pulled.skipped} Instagram rows were skipped because the amount was missing or not a currency unit.`)
      filename = 'meta-creator-instagram-last-28d.csv'
      notes = 'Approximate Instagram content monetization from the professional account. Not a payout invoice.'
      externalKey = META_CREATOR_IG_PULL_KEY
    }

    const [store, trackLookup] = await Promise.all([readRoyaltyStore(), loadTrackSplitLookup()])
    const result = ingestRoyaltyStatement({
      csvText: csv,
      filename,
      notes,
      externalKey,
      trackLookup,
      store,
    })
    if (!result.duplicate && result.lineCount > 0) await writeRoyaltyStore(result.store)
    const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(windowCents / 100)
    const note =
      result.lineCount > 0
        ? null
        : dayCount > 0
          ? `That window reported ${dollars} across ${dayCount} days. Nothing was written.`
          : null
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      replaced: result.replaced,
      statement: result.statement,
      lineCount: result.lineCount,
      note,
      warnings: [...warnings, ...result.warnings].slice(0, 40),
    })
  } catch (error) {
    const message = error instanceof MetaGraphError ? error.message : error instanceof Error ? error.message : 'Pull failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
