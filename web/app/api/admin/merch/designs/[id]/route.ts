import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { artIdsOnlyUsedBy } from '@/lib/merch/art-url'
import { deleteMerchArt } from '@/lib/merch/art-store'
import { deleteDesign, listDesigns } from '@/lib/merch/design-store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const designs = await listDesigns()
    const design = designs.find((item) => item.id === params.id)
    if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
    const fileIds = artIdsOnlyUsedBy(design, designs)
    const removed = await deleteDesign(params.id)
    if (!removed) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
    await Promise.all(fileIds.map((id) => deleteMerchArt(id).catch(() => false)))
    return NextResponse.json({ ok: true, removedFiles: fileIds.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete the design'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
