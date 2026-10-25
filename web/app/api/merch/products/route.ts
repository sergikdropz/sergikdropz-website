import { NextResponse } from 'next/server'
import { listDesigns } from '@/lib/merch/design-store'
import { designToShopProduct } from '@/lib/merch/design'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const dynamic = 'force-dynamic'

const CATEGORIES = [
  { id: 'tees', label: 'T-Shirts' },
  { id: 'hoodies', label: 'Hoodies' },
  { id: 'hats', label: 'Hats' },
  { id: 'pants', label: 'Pants' },
  { id: 'accessories', label: 'Accessories' },
]

export async function GET() {
  try {
    let synced: any[] = []
    try {
      const raw = await readFile(join(process.cwd(), 'data', 'merch-products.json'), 'utf8')
      const merchData = JSON.parse(raw)
      synced = Array.isArray(merchData.products) ? merchData.products : []
    } catch {
      synced = []
    }

    const designs = await listDesigns()
    const designed = designs
      .map((design) => designToShopProduct(design))
      .filter((product): product is NonNullable<typeof product> => Boolean(product))
    const slugs = new Set(designed.map((product) => product.slug))
    const products = [
      ...designed,
      ...synced.filter((product) => product?.slug && !slugs.has(product.slug)),
    ]

    return NextResponse.json({ products, categories: CATEGORIES })
  } catch (error: any) {
    console.error('Error loading merch products:', error)
    return NextResponse.json({ products: [], categories: CATEGORIES })
  }
}
