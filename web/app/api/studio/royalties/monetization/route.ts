import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { graphGet } from '@/lib/meta/graph'
import { loadMetaRoyaltyAccess } from '@/lib/meta/connection'
import { metaMonetizationSystems } from '@/lib/studio/monetization-readiness'
import { readRoyaltyStore } from '@/lib/studio/royalties'

export const dynamic = 'force-dynamic'

function scopeMissing(scopes: string[], required: string): boolean {
  return scopes.length > 0 && !scopes.includes(required)
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const access = await loadMetaRoyaltyAccess()
  let pageFollowers = 0
  let pageName = 'The Page'
  let igFollowers = 0
  let igUsername = 'instagram'
  if (access?.pageToken && access.pageId) {
    try {
      const page = await graphGet<{ name?: string; fan_count?: number; followers_count?: number }>(
        `/${access.pageId}`,
        access.pageToken,
        { fields: 'name,fan_count,followers_count' },
      )
      pageName = page.name || pageName
      pageFollowers = Number(page.followers_count ?? page.fan_count ?? 0) || 0
    } catch {
      pageName = 'The Page'
    }
  }
  if (access?.userToken && access.igUserId) {
    try {
      const ig = await graphGet<{ username?: string; followers_count?: number }>(
        `/${access.igUserId}`,
        access.userToken,
        { fields: 'username,followers_count' },
      )
      igUsername = ig.username || igUsername
      igFollowers = Number(ig.followers_count ?? 0) || 0
    } catch {
      igUsername = 'instagram'
    }
  }
  const store = await readRoyaltyStore()
  const recordingCents = store.statements
    .filter((row) => row.category === 'recording_royalty' && row.source === 'distrokid')
    .reduce((sum, row) => sum + (row.grossCents || 0), 0)
  const creatorCents = store.statements
    .filter((row) => row.externalKey === 'meta_creator:last_28d')
    .reduce((sum, row) => sum + (row.grossCents || 0), 0)
  return NextResponse.json({
    systems: metaMonetizationSystems({
      pageFollowers,
      pageName,
      igFollowers,
      igUsername,
      recordingCents,
      creatorCents,
      instagramInsights: Boolean(access?.userToken && access.igUserId && !scopeMissing(access.scopes, 'instagram_manage_insights')),
    }),
    pageFollowers,
    igFollowers,
  })
}
