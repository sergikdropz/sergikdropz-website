import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  fetchCatalogProductDetail,
  fetchPlacementPrintAreas,
  resolvePlacementPrintArea,
} from '@/lib/merch/printful-catalog'
import { pickPreviewVariant } from '@/lib/merch/catalog-studio'
import { printfulFetch } from '@/lib/printful'

export const dynamic = 'force-dynamic'

/** Live Printful mockup task (requires API key + public art URL). */
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  if (!process.env.PRINTFUL_API_KEY) {
    return NextResponse.json({ error: 'PRINTFUL_API_KEY required for live mockups' }, { status: 503 })
  }

  const productId = Number(context.params.id)
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const artUrl = String(body?.artUrl || '')
  const placement = String(body?.placement || 'front')
  const color = body?.color ? String(body.color) : null
  const size = body?.size ? String(body.size) : null
  // Mockup style controls (Printful: width 50–2000, lifelike effect, style limiting).
  const width = Math.min(2000, Math.max(50, Number(body?.width) || 1000))
  const lifelike = body?.lifelike === true
  const optionGroups = Array.isArray(body?.optionGroups) ? body.optionGroups.map(String) : null
  const options = Array.isArray(body?.options) ? body.options.map(String) : null

  if (!artUrl.startsWith('https://')) {
    return NextResponse.json(
      { error: 'Printful needs a public https art URL for mockup generation.' },
      { status: 400 }
    )
  }

  const detail = await fetchCatalogProductDetail(productId)
  if (!detail) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const variant = pickPreviewVariant(detail.variants, color, size)
  if (!variant) {
    return NextResponse.json({ error: 'No variant for preview' }, { status: 400 })
  }

  const fileType =
    detail.printFiles.find((file) => file.type === placement)?.type ||
    detail.printFiles.find((file) => file.type === 'front')?.type ||
    detail.printFiles[0]?.type ||
    'front'

  // Real print-area dimensions for THIS product + placement (not a tee default).
  const printAreas = await fetchPlacementPrintAreas(productId)
  const area = resolvePlacementPrintArea(printAreas, fileType)
  const areaWidth = area?.width ?? 1800
  const areaHeight = area?.height ?? 2400

  const taskBody: Record<string, unknown> = {
    variant_ids: [variant.id],
    format: 'jpg',
    width,
    files: [
      {
        placement: fileType,
        image_url: artUrl,
        position: {
          area_width: areaWidth,
          area_height: areaHeight,
          width: areaWidth,
          height: areaHeight,
          top: 0,
          left: 0,
        },
      },
    ],
  }
  if (lifelike) taskBody.product_options = { lifelike: true }
  if (optionGroups && optionGroups.length > 0) taskBody.option_groups = optionGroups
  if (options && options.length > 0) taskBody.options = options

  try {
    const task = await printfulFetch(`/mockup-generator/create-task/${productId}`, {
      method: 'POST',
      body: JSON.stringify(taskBody),
    })
    return NextResponse.json({
      taskKey: task.result?.task_key ?? null,
      variantId: variant.id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Mockup task failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
