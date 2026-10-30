import { NextRequest, NextResponse } from 'next/server'
import { fetchCatalogProductDetail } from '@/lib/merch/printful-catalog'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const productId = Number(context.params.id)
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Invalid catalog product id' }, { status: 400 })
  }

  try {
    const detail = await fetchCatalogProductDetail(productId)
    if (!detail) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    return NextResponse.json({
      detail: {
        product: detail.product,
        colors: detail.colors.map((color) => ({
          name: color.name,
          hex: color.hex,
          hex2: color.hex2 ?? null,
        })),
        variants: detail.variants.map((row) => ({
          id: row.id,
          color: row.color,
          size: row.size,
          image: row.image,
          color_code: row.color_code,
          in_stock: row.in_stock,
        })),
        printFiles: detail.printFiles.map((file) => ({
          fileId: file.fileId,
          type: file.type,
          title: file.title,
          templateUrl: file.templateUrl,
          variantTemplates: file.variantTemplates,
          mockupStage: file.mockupStage,
          templateAspect: file.templateAspect,
          printWidth: file.printWidth,
          printHeight: file.printHeight,
          mockupSupported: file.mockupSupported,
        })),
        fileTypes: detail.fileTypes,
        description: detail.description,
        techniques: detail.techniques,
        specs: detail.specs
          ? {
              lead: detail.specs.lead,
              bullets: detail.specs.bullets,
              styleLines: detail.specs.styleLines,
              originCountry: detail.specs.originCountry,
              materials: detail.specs.materials,
            }
          : null,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not load garment preview'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
