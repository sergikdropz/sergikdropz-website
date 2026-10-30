import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { rememberPrintArtId } from '@/lib/merch/art-store'
import { assembleMerchArtParts, storeMerchArtPart } from '@/lib/merch/r2-art'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UPLOAD_ID = /^[0-9a-f-]{36}$/i
const MAX_CHUNK = 4 * 1024 * 1024
const MAX_PARTS = 16

/**
 * Accept one piece of a large art file. Each piece stays under Vercel's request
 * limit. The last piece joins them in R2. Used when the browser cannot PUT
 * straight to R2 because the bucket has no upload CORS.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'File required' }, { status: 400 })
  }
  const type = String(form.get('contentType') || '').toLowerCase()
  if (type !== 'image/png' && type !== 'image/jpeg') {
    return NextResponse.json({ error: 'Use a PNG or JPEG' }, { status: 400 })
  }
  const total = Number(form.get('total'))
  const index = Number(form.get('index'))
  if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS) {
    return NextResponse.json({ error: 'Upload is too large' }, { status: 400 })
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return NextResponse.json({ error: 'Upload piece is out of order' }, { status: 400 })
  }
  if (file.size > MAX_CHUNK) {
    return NextResponse.json({ error: 'Upload piece is too large' }, { status: 400 })
  }

  const suppliedId = String(form.get('uploadId') || '')
  const uploadId = suppliedId || randomUUID()
  if (!UPLOAD_ID.test(uploadId)) {
    return NextResponse.json({ error: 'Unknown upload' }, { status: 400 })
  }
  if (index > 0 && !suppliedId) {
    return NextResponse.json({ error: 'Upload piece is missing its id' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  try {
    await storeMerchArtPart(uploadId, index, bytes, type)
    if (index < total - 1) {
      return NextResponse.json({ uploadId, index, done: false })
    }
    const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : 'png'
    const stored = await assembleMerchArtParts(uploadId, total, `${uploadId}.${ext}`, type)
    if (form.get('origin') === 'print') await rememberPrintArtId(stored.id)
    return NextResponse.json({ ...stored, uploadId, done: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not store that artwork'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
