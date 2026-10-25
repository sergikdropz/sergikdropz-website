import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { listDesigns } from '@/lib/merch/design-store'
import { deleteMerchArt, isMerchArtId, listMerchArtUploads, storeMerchArt } from '@/lib/merch/art-store'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 15 * 1024 * 1024

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const uploads = await listMerchArtUploads()
  return NextResponse.json({ uploads })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required' }, { status: 400 })
  }
  const type = file.type || ''
  if (type !== 'image/png' && type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Use a PNG or JPEG' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is over 15MB' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const stored = await storeMerchArt(bytes, type)
  return NextResponse.json(stored)
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const id = new URL(request.url).searchParams.get('id') || ''
  if (!isMerchArtId(id)) {
    return NextResponse.json({ error: 'Unknown artwork' }, { status: 400 })
  }

  const designs = await listDesigns()
  const usedBy = designs.find((design) =>
    design.placements.some((placement) => placement.assetUrl.endsWith(`/${id}`))
  )
  if (usedBy) {
    return NextResponse.json(
      { error: `“${usedBy.name}” still uses this artwork. Replace it on that design first.` },
      { status: 409 }
    )
  }

  const removed = await deleteMerchArt(id)
  if (!removed) {
    return NextResponse.json({ error: 'Could not remove that artwork' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
