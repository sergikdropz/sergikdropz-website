import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  PRINTFUL_CATALOG_NAV_TOP,
  catalogSidebarRoots,
  readPrintfulCategoriesCache,
  syncPrintfulCategoriesFromApi,
} from '@/lib/merch/printful-categories'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let snapshot = await readPrintfulCategoriesCache()
  if (!snapshot.syncedAt || snapshot.roots.length === 0) {
    try {
      snapshot = await syncPrintfulCategoriesFromApi()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Category sync failed'
      return NextResponse.json({ navTop: PRINTFUL_CATALOG_NAV_TOP, roots: [], error: message }, { status: 502 })
    }
  }

  return NextResponse.json({
    syncedAt: snapshot.syncedAt,
    navTop: PRINTFUL_CATALOG_NAV_TOP,
    roots: catalogSidebarRoots(snapshot.roots),
    allRoots: snapshot.roots,
  })
}
