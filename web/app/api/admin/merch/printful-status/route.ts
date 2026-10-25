import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { readPrintfulCatalogCache } from '@/lib/merch/printful-catalog'
import { isPublicFulfillmentUrl } from '@/lib/merch/design'
import { diagnosePrintfulSetup } from '@/lib/merch/printful-setup'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const snapshot = await readPrintfulCatalogCache()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const catalogStale =
    snapshot.products.length === 0 ||
    !snapshot.syncedAt ||
    Date.now() - Date.parse(snapshot.syncedAt) > 7 * 24 * 60 * 60 * 1000

  const setup = await diagnosePrintfulSetup()

  return NextResponse.json({
    hasApiKey: setup.hasApiKey,
    hasStoreId: setup.hasStoreId,
    apiKeyValid: setup.apiKeyValid,
    apiError: setup.apiError,
    storeId: setup.storeId,
    storeMatch: setup.storeMatch,
    stores: setup.stores,
    catalogSynced: snapshot.products.length > 0,
    catalogStale,
    catalogProductCount: snapshot.productCount || snapshot.products.length,
    catalogSyncedAt: snapshot.syncedAt,
    canPublish: setup.canPublish,
    templatesReachable: setup.templatesReachable,
    publicArtOrigin: isPublicFulfillmentUrl(siteUrl),
    setupDoc: '/admin/merch#printful-api',
  })
}
