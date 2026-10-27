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
        variants: detail.variants.map((row) => ({
          color: row.color,
          size: row.size,
          image: row.image,
          in_stock: row.in_stock,
        })),
        printFiles: detail.printFiles.map((file) => ({
          fileId: file.fileId,
          type: file.type,
          title: file.title,
          templateUrl: file.templateUrl,
          mockupStage: file.mockupStage,
          printWidth: file.printWidth,
          printHeight: file.printHeight,
          mockupSupported: file.mockupSupported,
        })),
        fileTypes: detail.fileTypes,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not load garment preview'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
