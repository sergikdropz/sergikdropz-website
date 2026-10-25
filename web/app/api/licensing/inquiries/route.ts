import { NextResponse } from 'next/server'
import { submitLicensingInquiry } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await submitLicensingInquiry(body, request)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({
      publicId: result.publicId,
      status: result.status,
      deskPath: result.deskPath,
      message: 'Inquiry received. This does not grant permission to use the music.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the inquiry.'
    const missing = /licensing_inquiries|licensing_clients|schema cache/i.test(message)
    return NextResponse.json(
      { error: missing ? 'Licensing storage is not installed yet. Apply web/supabase/migrations/add_licensing_platform.sql.' : message },
      { status: missing ? 503 : 500 },
    )
  }
}
