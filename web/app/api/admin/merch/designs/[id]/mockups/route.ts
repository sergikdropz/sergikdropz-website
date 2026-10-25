import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getDesign, saveDesign } from '@/lib/merch/design-store'
import { collectMockupUrls } from '@/lib/merch/publish'
import { printfulFetch } from '@/lib/printful'
import { storeMerchArt } from '@/lib/merch/art-store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const design = await getDesign(params.id)
  if (!design) return NextResponse.json({ error: 'Design not found' }, { status: 404 })
  if (!design.mockupTaskKey) {
    return NextResponse.json({ status: 'idle', design })
  }
  if (!process.env.PRINTFUL_API_KEY) {
    return NextResponse.json({ status: 'idle', design })
  }

  const task = await printfulFetch(
    `/mockup-generator/task?task_key=${encodeURIComponent(design.mockupTaskKey)}`
  )
  const state = String(task.result?.status || 'pending')
  if (state !== 'completed') {
    return NextResponse.json({ status: state, design })
  }

  const remote = collectMockupUrls(task.result).slice(0, 6)
  const stored: string[] = []
  for (const url of remote) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        stored.push(url)
        continue
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      const saved = await storeMerchArt(bytes, res.headers.get('content-type') || 'image/jpeg')
      stored.push(saved.url)
    } catch {
      stored.push(url)
    }
  }

  const saved = await saveDesign({
    ...design,
    mockupUrls: stored.length > 0 ? stored : design.mockupUrls,
    mockupTaskKey: null,
    publishNote: design.status === 'live' ? design.publishNote : 'Photos are ready. It is still hidden until you make it public.',
    updatedAt: new Date().toISOString(),
  })

  return NextResponse.json({ status: 'completed', design: saved.design })
}
