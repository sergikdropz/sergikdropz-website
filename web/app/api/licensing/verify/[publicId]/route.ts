import { NextResponse } from 'next/server'
import { publicLicenseVerification } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

type Params = { params: { publicId: string } }

export async function GET(_request: Request, { params }: Params) {
  const row = await publicLicenseVerification(decodeURIComponent(params.publicId))
  if (!row) return NextResponse.json({ error: 'No active license matches that reference.' }, { status: 404 })
  return NextResponse.json(row)
}
