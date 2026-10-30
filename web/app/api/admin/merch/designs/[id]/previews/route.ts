import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { merchArtIdFromUrl } from '@/lib/merch/art-url'
import { getDesign, saveDesign } from '@/lib/merch/design-store'
import { publishDesignToPrintful } from '@/lib/merch/publish'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

/** Ask Printful for new preview photos without changing shop visibility. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const design = await getDesign(params.id)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
  if (design.placements.length === 0) {
    return NextResponse.json({ error: 'Add art before making photos' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const printFiles = body?.printFiles && typeof body.printFiles === 'object' ? body.printFiles : {}
  const printFileUrls = { ...(design.printFileUrls || {}) }
  for (const [key, url] of Object.entries(printFiles as Record<string, unknown>)) {
    if (typeof url === 'string' && merchArtIdFromUrl(url)) printFileUrls[key.slice(0, 64)] = url
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`

  let result
  try {
    result = await publishDesignToPrintful(design, origin, printFiles, { previewOnly: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Printful could not make new photos'
    result = {
      variants: design.variants,
      printfulSyncProductId: design.printfulSyncProductId,
      mockupTaskKey: null,
      requestedMockups: false,
      wholesaleCost: design.wholesaleCost,
      note: message,
    }
  }

  const saved = await saveDesign({
    ...design,
    variants: result.variants.length > 0 ? result.variants : design.variants,
    printfulSyncProductId: result.printfulSyncProductId || design.printfulSyncProductId,
    mockupTaskKey: result.reusePhotos
      ? null
      : result.requestedMockups
        ? result.mockupTaskKey
        : design.mockupTaskKey,
    mockupPendingKey: result.mockupTaskKey ? result.mockupPhotoKey || null : design.mockupPendingKey || null,
    printFileUrls,
    wholesaleCost: result.wholesaleCost ?? design.wholesaleCost,
    publishNote: result.note,
    updatedAt: new Date().toISOString(),
  })

  return NextResponse.json(saved)
}
