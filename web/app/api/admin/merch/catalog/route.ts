import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { syncPrintfulCategoriesFromApi } from '@/lib/merch/printful-categories'
import {
  filterCatalogProducts,
  listCatalogProductsLive,
  readPrintfulCatalogCache,
  syncPrintfulCatalogFromApi,
} from '@/lib/merch/printful-catalog'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { searchParams } = request.nextUrl
  const refresh = searchParams.get('refresh') === '1'
  const q = searchParams.get('q') || undefined
  const category = searchParams.get('category') || undefined
  const categoryId = searchParams.get('categoryId')
    ? Number(searchParams.get('categoryId'))
    : undefined
  const nav = searchParams.get('nav') || undefined
  const favoriteIds = (searchParams.get('favoriteIds') || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  const limit = Number(searchParams.get('limit') || '80')
  const live = searchParams.get('live') === '1' || Boolean(categoryId)

  let snapshot = await readPrintfulCatalogCache()
  const stale = !snapshot.syncedAt || snapshot.products.length === 0

  if (refresh || stale) {
    try {
      snapshot = await syncPrintfulCatalogFromApi()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Catalog sync failed'
      return NextResponse.json(
        {
          ...snapshot,
          products: filterCatalogProducts(snapshot.products, { q, category, limit }),
          error: message,
        },
        { status: 502 }
      )
    }
  }

  let products = snapshot.products
  if (live && categoryId) {
    try {
      products = await listCatalogProductsLive({ categoryId, q, limit: Math.max(limit, 120) })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Live catalog fetch failed'
      return NextResponse.json(
        {
          syncedAt: snapshot.syncedAt,
          productCount: snapshot.productCount,
          products: filterCatalogProducts(snapshot.products, {
            q,
            category,
            categoryId,
            limit,
            favorites: nav === 'favorites' ? favoriteIds : undefined,
            fastDeliveryOnly: nav === 'fast-delivery',
            specialOffersOnly: nav === 'special-offers',
          }),
          error: message,
        },
        { status: 502 }
      )
    }
  } else {
    products = filterCatalogProducts(snapshot.products, {
      q,
      category,
      categoryId,
      limit,
      favorites: nav === 'favorites' ? favoriteIds : undefined,
      fastDeliveryOnly: nav === 'fast-delivery',
      specialOffersOnly: nav === 'special-offers',
    })
  }

  return NextResponse.json({
    syncedAt: snapshot.syncedAt,
    productCount: snapshot.productCount,
    products,
    hasApiKey: Boolean(process.env.PRINTFUL_API_KEY),
  })
}

export async function POST() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const [snapshot] = await Promise.all([
      syncPrintfulCatalogFromApi(),
      syncPrintfulCategoriesFromApi().catch(() => null),
    ])
    return NextResponse.json({
      success: true,
      productCount: snapshot.productCount,
      syncedAt: snapshot.syncedAt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Catalog sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
