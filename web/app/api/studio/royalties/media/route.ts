import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { collectLedgerMedia } from '@/lib/studio/royalties/ledger-media'

export const dynamic = 'force-dynamic'

/** GET /api/studio/royalties/media — YouTube and Instagram items that can name a ledger track. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const result = await collectLedgerMedia()
  return NextResponse.json(result)
}
