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
import { ingestRoyaltyStatement, readRoyaltyStore, writeRoyaltyStore } from '@/lib/studio/royalties'
import { loadTrackSplitLookup } from '@/lib/studio/royalties/track-lookup'

export const META_EARNINGS_CONNECT_PATH = '/api/studio/meta/connect?earnings=1&next=/studio/royalties'

export type MetaEarningsPullResult = {
  ok: boolean
  note: string
  adsLineCount: number
  creatorLineCount: number
  connectPath: string
}

function scopeMissing(scopes: string[], required: string): boolean {
  return scopes.length > 0 && !scopes.includes(required)
}

/**
 * Pull Facebook creator earnings and Meta ad spend through the Graph API and replace the prior snapshots.
 * Does not open Ads Manager and does not invent a token.
 */
export async function runMetaEarningsPull(): Promise<MetaEarningsPullResult> {
  const connectPath = META_EARNINGS_CONNECT_PATH
  const access = await loadMetaRoyaltyAccess()
  if (!access?.userToken && !access?.pageToken) {
    return {
      ok: false,
      note: 'Meta is not connected. Open the Meta desk connect once and allow ads_read and read_insights.',
      adsLineCount: 0,
      creatorLineCount: 0,
      connectPath,
    }
  }

  const notes: string[] = []
  let adsLineCount = 0
  let creatorLineCount = 0
  let store = await readRoyaltyStore()
  const trackLookup = await loadTrackSplitLookup()
  let changed = false

  if (access.pageToken && access.pageId && !scopeMissing(access.scopes, 'read_insights')) {
    try {
      const window = creatorWindow()
      const pulled = await pullMetaCreatorCsv({
        pageToken: access.pageToken,
        pageId: access.pageId,
        since: window.since,
        until: window.until,
      })
      const ingested = ingestRoyaltyStatement({
        csvText: pulled.csv,
        filename: 'meta-creator-last-28d.csv',
        notes: 'Approximate Facebook content monetization from Page insights. Not a bank statement.',
        externalKey: META_CREATOR_PULL_KEY,
        trackLookup,
        store,
      })
      if (!ingested.duplicate && ingested.lineCount > 0) {
        store = ingested.store
        changed = true
      }
      creatorLineCount = ingested.lineCount
      notes.push(
        ingested.duplicate && ingested.lineCount === 0
          ? 'Facebook creator earnings were already current.'
          : pulled.windowCents === 0
            ? `Facebook creator earnings reported $0.00 across ${pulled.dayCount} days.`
            : `Facebook creator earnings: ${ingested.lineCount} days.`,
      )
    } catch (error) {
      notes.push(error instanceof MetaGraphError ? error.message : 'Facebook creator earnings could not be pulled.')
    }
  } else {
    notes.push('Facebook creator earnings need a Page token with read_insights.')
  }

  if (access.userToken && access.igUserId && !scopeMissing(access.scopes, 'instagram_manage_insights')) {
    try {
      const window = creatorWindow()
      const pulled = await pullInstagramCreatorCsv({
        userToken: access.userToken,
        igUserId: access.igUserId,
        since: window.since,
        until: window.until,
      })
      if (pulled.unavailable) {
        notes.push('Instagram insights are connected. Meta does not include creator earnings in professional-account insights.')
      } else {
      const ingested = ingestRoyaltyStatement({
        csvText: pulled.csv,
        filename: 'meta-creator-instagram-last-28d.csv',
        notes: 'Approximate Instagram content monetization from the professional account. Not a payout invoice.',
        externalKey: META_CREATOR_IG_PULL_KEY,
        trackLookup,
        store,
      })
      if (!ingested.duplicate && ingested.lineCount > 0) {
        store = ingested.store
        changed = true
      }
      creatorLineCount += ingested.lineCount
      notes.push(
        pulled.windowCents === 0
          ? `Instagram creator earnings reported $0.00 across ${pulled.dayCount} days.`
          : `Instagram creator earnings: ${ingested.lineCount} days.`,
      )
      }
    } catch (error) {
      notes.push(error instanceof MetaGraphError ? error.message : 'Instagram creator earnings could not be pulled.')
    }
  } else {
    notes.push('Instagram creator earnings need a reconnect that allows Instagram insights.')
  }

  if (access.userToken && !scopeMissing(access.scopes, 'ads_read')) {
    try {
      const account = await resolveMetaAdAccountId(access.userToken)
      if (!account.id) {
        notes.push(account.note)
      } else {
        const pulled = await pullMetaAdSpendCsv({ userToken: access.userToken, adAccountId: account.id })
        const ingested = ingestRoyaltyStatement({
          csvText: pulled.csv,
          filename: 'meta-ads-last-30d.csv',
          notes: 'Pulled from Meta Ads Insights. Spend is a cost, not income.',
          externalKey: META_ADS_PULL_KEY,
          trackLookup,
          store,
        })
        if (!ingested.duplicate && ingested.lineCount > 0) {
          store = ingested.store
          changed = true
        }
        adsLineCount = ingested.lineCount
        notes.push(`${account.note} Ad spend rows: ${ingested.lineCount}.`)
        if (pulled.truncated) notes.push('Meta returned more than 200 ad sets. This pull kept the first page.')
      }
    } catch (error) {
      notes.push(error instanceof MetaGraphError ? error.message : 'Meta ad spend could not be pulled.')
    }
  } else {
    notes.push('Ad spend needs a user token with ads_read.')
  }

  if (changed) await writeRoyaltyStore(store)
  const blocked = /could not be pulled|need a Page token|need a user token|no ad account|Several ad accounts|not connected/i
  const ok = notes.length > 0 && notes.some((note) => !blocked.test(note))
  return {
    ok,
    note: notes.join(' '),
    adsLineCount,
    creatorLineCount,
    connectPath,
  }
}
