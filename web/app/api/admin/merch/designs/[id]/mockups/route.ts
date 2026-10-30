import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { getDesign, listDesigns, saveDesign } from '@/lib/merch/design-store'
import { mockupAnglesByColorFromTask } from '@/lib/merch/publish'
import { fetchCatalogProductDetail } from '@/lib/merch/printful-catalog'
import { sameColorKey } from '@/lib/merch/catalog-studio'
import { printfulFetch } from '@/lib/printful'
import { deleteMerchArt, storeMerchArt } from '@/lib/merch/art-store'
import { merchArtIdsFromUrls, referencedArtIds } from '@/lib/merch/art-url'
import { rememberPrintfulGeneratedArtIds } from '@/lib/merch/r2-art'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STORE_BATCH = 8

function hasRemoteMockup(urls: Record<string, string[]> | undefined): boolean {
  return Object.values(urls || {}).some((list) => list.some((url) => url.startsWith('http')))
}

function photosForColor(urls: Record<string, string[]>, colorName: string | null | undefined): string[] {
  const match = Object.entries(urls).find(([name]) => sameColorKey(name, colorName))
  return (match?.[1] || Object.values(urls)[0] || []).filter(Boolean)
}

async function localizeMockupUrl(url: string): Promise<string> {
  if (!url.startsWith('http')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const bytes = Buffer.from(await res.arrayBuffer())
    const saved = await storeMerchArt(bytes, res.headers.get('content-type') || 'image/jpeg', {
      origin: 'printful',
    })
    return saved.url
  } catch {
    return url
  }
}

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

  const displayed = { ...(design.mockupUrlsByColor || {}) }
  const titles = { ...(design.mockupAngleTitlesByColor || {}) }
  let pending = { ...(design.mockupPendingByColor || {}) }
  let pendingTitles = { ...(design.mockupPendingTitlesByColor || {}) }
  let retired = [...(design.mockupRetiredArtIds || [])]
  const photoKeys = { ...(design.mockupPhotoKeysByColor || {}) }
  if (!hasRemoteMockup(pending)) {
    const detail = design.catalogProductId
      ? await fetchCatalogProductDetail(design.catalogProductId).catch(() => null)
      : null
    const colorByVariant = new Map<number, string>()
    for (const variant of detail?.variants || []) {
      if (variant.id && variant.color) colorByVariant.set(variant.id, variant.color)
    }
    for (const variant of design.variants) {
      if (variant.catalogVariantId && variant.color) colorByVariant.set(variant.catalogVariantId, variant.color)
    }
    const fresh = mockupAnglesByColorFromTask(task.result, colorByVariant, design.previewColorName || null)
    if (Object.keys(fresh).length === 0) {
      const saved = await saveDesign({
        ...design,
        mockupTaskKey: null,
        mockupPendingByColor: {},
        mockupPendingTitlesByColor: {},
        publishNote: 'Printful finished without photos. Put it out again.',
        updatedAt: new Date().toISOString(),
      })
      return NextResponse.json({ status: 'failed', design: saved.design })
    }
    pending = {}
    pendingTitles = {}
    const retiring: string[] = []
    for (const [color, angles] of Object.entries(fresh)) {
      pending[color] = angles.map((angle) => angle.url)
      pendingTitles[color] = angles.map((angle) => angle.title)
      const previous = Object.entries(displayed).find(([name]) => sameColorKey(name, color))?.[1] || []
      retiring.push(...previous)
      if (sameColorKey(color, design.previewColorName)) retiring.push(...(design.mockupUrls || []))
    }
    retired = merchArtIdsFromUrls(retiring)
  }

  try {
    await rememberPrintfulGeneratedArtIds(retired)
  } catch (error) {
    console.error('merch printful art index:', error)
  }

  let stored = 0
  let attempts = 0
  for (const [color, urls] of Object.entries(pending)) {
    for (let index = 0; index < urls.length; index += 1) {
      if (!urls[index].startsWith('http')) continue
      if (attempts >= STORE_BATCH) break
      attempts += 1
      const next = await localizeMockupUrl(urls[index])
      if (next !== urls[index]) stored += 1
      urls[index] = next
    }
    pending[color] = urls
    if (attempts >= STORE_BATCH) break
  }

  for (const [color, urls] of Object.entries(pending)) {
    if (urls.some((url) => url.startsWith('http'))) continue
    const local = urls.filter(Boolean)
    if (local.length === 0) continue
    displayed[color] = local
    titles[color] = pendingTitles[color] || []
    if (design.mockupPendingKey) photoKeys[color] = design.mockupPendingKey
    delete pending[color]
    delete pendingTitles[color]
  }

  const gaveUp = hasRemoteMockup(pending) && stored === 0
  const stillRemote = hasRemoteMockup(pending) && !gaveUp
  if (gaveUp) {
    pending = {}
    pendingTitles = {}
    retired = []
  }
  const previewPhotos = photosForColor(displayed, design.previewColorName)
  const saved = await saveDesign({
    ...design,
    mockupUrls: previewPhotos.length > 0 ? previewPhotos : design.mockupUrls,
    mockupUrlsByColor: displayed,
    mockupAngleTitlesByColor: titles,
    mockupPendingByColor: stillRemote ? pending : {},
    mockupPendingTitlesByColor: stillRemote ? pendingTitles : {},
    mockupPendingKey: stillRemote ? design.mockupPendingKey || null : null,
    mockupPhotoKeysByColor: photoKeys,
    mockupRetiredArtIds: stillRemote ? retired : [],
    mockupTaskKey: stillRemote ? design.mockupTaskKey : null,
    publishNote: stillRemote
      ? 'Saving this color’s photos. The other colors stay on the garment template.'
      : design.status === 'live'
        ? design.publishNote
        : 'Photos are ready. It is still hidden until you make it public.',
    updatedAt: new Date().toISOString(),
  })

  if (!stillRemote && retired.length > 0) {
    const nextIds = new Set(
      merchArtIdsFromUrls([
        ...(saved.design.mockupUrls || []),
        ...Object.values(displayed).flat(),
        ...Object.values(pending).flat(),
      ]),
    )
    const previous = retired.filter((id) => !nextIds.has(id))
    if (previous.length > 0) {
      const designs = await listDesigns()
      const stillUsed = new Set(designs.flatMap((item) => referencedArtIds(item)))
      await Promise.all(
        previous.filter((id) => !stillUsed.has(id)).map((id) => deleteMerchArt(id).catch(() => false)),
      )
    }
  }

  return NextResponse.json({ status: stillRemote ? 'storing' : 'completed', design: saved.design })
}
