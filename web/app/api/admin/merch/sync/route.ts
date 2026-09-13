import { NextResponse } from 'next/server'
import { getProducts, getProductDetails } from '@/lib/printful'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function POST() {
  try {
    if (!process.env.PRINTFUL_API_KEY) {
      return NextResponse.json(
        { error: 'Printful API key not configured' },
        { status: 500 }
      )
    }

    const storeProducts = await getProducts()

    const products = await Promise.all(
      storeProducts.map(async (p: any) => {
        try {
          const details = await getProductDetails(String(p.id))
          return {
            id: String(p.id),
            name: details.sync_product.name,
            slug: details.sync_product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            thumbnail: details.sync_product.thumbnail_url,
            images: details.sync_variants
              ?.map((v: any) => v.files?.find((f: any) => f.type === 'preview')?.preview_url)
              .filter(Boolean) || [],
            category: categorizeProduct(details.sync_product.name),
            variants: details.sync_variants?.map((v: any) => ({
              id: v.id,
              name: v.name,
              printful_variant_id: v.variant_id,
              retail_price: parseFloat(v.retail_price) || 0,
              size: v.size || null,
              color: v.color || null,
              in_stock: v.availability_status === 'active',
            })) || [],
            status: 'active',
          }
        } catch (err) {
          console.error(`Error fetching details for product ${p.id}:`, err)
          return null
        }
      })
    )

    const validProducts = products.filter(Boolean)

    // Write to data file
    const merchData = {
      products: validProducts,
      categories: [
        { id: 'tees', label: 'T-Shirts' },
        { id: 'hoodies', label: 'Hoodies' },
        { id: 'hats', label: 'Hats' },
        { id: 'accessories', label: 'Accessories' },
      ],
      lastSyncedAt: new Date().toISOString(),
    }

    const filePath = join(process.cwd(), 'data', 'merch-products.json')
    await writeFile(filePath, JSON.stringify(merchData, null, 2))

    return NextResponse.json({
      success: true,
      productsCount: validProducts.length,
      syncedAt: merchData.lastSyncedAt,
    })
  } catch (error: any) {
    console.error('Merch sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync products' },
      { status: 500 }
    )
  }
}

function categorizeProduct(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('hoodie') || lower.includes('sweatshirt')) return 'hoodies'
  if (lower.includes('hat') || lower.includes('cap') || lower.includes('beanie')) return 'hats'
  if (lower.includes('tee') || lower.includes('t-shirt') || lower.includes('shirt')) return 'tees'
  return 'accessories'
}
