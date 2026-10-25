import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { requireAdminApi } from '@/lib/auth/route-policy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const gallery: Array<{ id: string; label: string; url: string; kind: 'gallery' }> = []
  const releases: Array<{ id: string; label: string; url: string; kind: 'release' }> = []

  try {
    const raw = await readFile(join(process.cwd(), 'data', 'gallery.json'), 'utf8')
    const parsed = JSON.parse(raw)
    for (const image of (parsed.images || []).slice(0, 24)) {
      if (!image?.src) continue
      gallery.push({
        id: String(image.id),
        label: String(image.alt || image.id),
        url: String(image.src),
        kind: 'gallery',
      })
    }
  } catch {
    /* gallery file is optional */
  }

  try {
    const raw = await readFile(join(process.cwd(), 'data', 'release-schedule.json'), 'utf8')
    const parsed = JSON.parse(raw)
    for (const release of (parsed.schedule || []).slice(0, 24)) {
      if (!release?.artwork) continue
      releases.push({
        id: String(release.id),
        label: String(release.title || 'Release'),
        url: String(release.artwork),
        kind: 'release',
      })
    }
  } catch {
    /* schedule file is optional */
  }

  return NextResponse.json({ gallery, releases })
}
