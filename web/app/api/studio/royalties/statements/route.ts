import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  ingestRoyaltyStatement,
  readRoyaltyStore,
  writeRoyaltyStore,
} from '@/lib/studio/royalties'
import { loadTrackSplitLookup } from '@/lib/studio/royalties/track-lookup'

export const dynamic = 'force-dynamic'

/** POST /api/studio/royalties/statements — ingest DistroKid / Revelator CSV */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const contentType = request.headers.get('content-type') || ''
    let csvText = ''
    let filename: string | null = null
    let notes: string | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      notes = form.get('notes') != null ? String(form.get('notes')) : null
      if (file && typeof file === 'object' && 'text' in file) {
        const blob = file as File
        filename = blob.name || null
        csvText = await blob.text()
      } else if (form.get('csvText')) {
        csvText = String(form.get('csvText'))
        filename = form.get('filename') != null ? String(form.get('filename')) : null
      }
    } else {
      const body = await request.json()
      csvText = String(body?.csvText || '')
      filename = body?.filename != null ? String(body.filename) : null
      notes = body?.notes != null ? String(body.notes) : null
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: 'csvText or file required' }, { status: 400 })
    }

    const [store, trackLookup] = await Promise.all([
      readRoyaltyStore(),
      loadTrackSplitLookup(),
    ])

    const result = ingestRoyaltyStatement({
      csvText,
      filename,
      notes,
      trackLookup,
      store,
    })

    if (!result.duplicate) {
      await writeRoyaltyStore(result.store)
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      statement: result.statement,
      lineCount: result.lineCount,
      ledgerCreated: result.ledgerCreated,
      warnings: result.warnings.slice(0, 40),
      warningCount: result.warnings.length,
    })
  } catch (error) {
    console.error('POST /api/studio/royalties/statements:', error)
    return NextResponse.json({ error: 'Failed to ingest statement' }, { status: 500 })
  }
}
