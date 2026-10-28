import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getBlank } from '@/lib/merch/blanks'
import { normalizePlacements, suggestRetail, type MerchDesign } from '@/lib/merch/design'
import { listDesigns, saveDesign, uniqueSlug } from '@/lib/merch/design-store'

export const dynamic = 'force-dynamic'

function normalizeActiveFileType(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/i.test(value) ? value : null
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const designs = await listDesigns()
  return NextResponse.json({ designs })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const blank = getBlank(String(body?.blankId || ''))
  if (!blank) {
    return NextResponse.json({ error: 'Pick a garment' }, { status: 400 })
  }

  const designs = await listDesigns()
  const existing = body?.id ? designs.find((design) => design.id === body.id) : null
  const now = new Date().toISOString()
  const name = String(body?.name || existing?.name || blank.name).slice(0, 80)
  const retail = Number(body?.retailPrice)
  const design: MerchDesign = {
    id: existing?.id || randomUUID(),
    name,
    slug: uniqueSlug(name, designs, existing?.id),
    blankId: blank.id,
    catalogProductId:
      body?.catalogProductId != null && Number.isFinite(Number(body.catalogProductId))
        ? Number(body.catalogProductId)
        : existing?.catalogProductId ?? blank.catalogHintId,
    family: blank.family,
    placements: normalizePlacements(body?.placements),
    activeFileType: normalizeActiveFileType(body?.activeFileType) ?? existing?.activeFileType ?? null,
    colors: Array.isArray(body?.colors) ? body.colors.map(String).slice(0, 8) : blank.defaultColors,
    sizes: Array.isArray(body?.sizes) ? body.sizes.map(String).slice(0, 8) : blank.defaultSizes,
    previewColor: String(body?.previewColor || existing?.previewColor || blank.colors[0]?.hex || '#1a1a1a'),
    retailPrice: Number.isFinite(retail) && retail > 0 ? retail : existing?.retailPrice || suggestRetail(blank.estimatedCost),
    wholesaleCost: existing?.wholesaleCost ?? blank.estimatedCost,
    status: existing?.status || 'draft',
    printfulSyncProductId: existing?.printfulSyncProductId || null,
    mockupTaskKey: existing?.mockupTaskKey || null,
    mockupUrls: existing?.mockupUrls || [],
    variants: existing?.variants || [],
    publishNote: existing?.publishNote || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  if (body?.status === 'draft' || body?.status === 'hidden' || body?.status === 'live') {
    design.status = body.status
  }

  const saved = await saveDesign(design)
  return NextResponse.json(saved)
}
