import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { licensingDeskContext } from '@/lib/licensing/desk-context'
import { internalQuote } from '@/lib/licensing/quote-sheet'
import { listLicensingInquiries } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response
  try {
    const inquiries = await listLicensingInquiries()
    const desk = await licensingDeskContext()
    const rows = inquiries.map((row) => ({
      ...row,
      quoteHint: internalQuote({
        kind: row.kind,
        usageType: String(row.rights?.usageType || ''),
        exclusivity: String(row.rights?.exclusivity || ''),
        rightsCleared: row.rights_cleared,
      }),
    }))
    return NextResponse.json({ inquiries: rows, ...desk })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load inquiries.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
