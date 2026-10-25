import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import {
  activateLicensingInquiry,
  clearLicensingVerification,
  markAgreementReviewed,
  rejectLicensingInquiry,
  saveLicenseDraft,
  sendLicensingQuote,
} from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function POST(request: Request, { params }: Params) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response
  try {
    const body = (await request.json()) as { action?: string; note?: string; cents?: number }
    const actor = guard.session.user?.email || guard.session.user?.id || 'admin'
    const note = String(body.note || '')
    if (body.action === 'clear') await clearLicensingVerification(params.id, actor)
    else if (body.action === 'reject') await rejectLicensingInquiry(params.id, actor, note)
    else if (body.action === 'quote') await sendLicensingQuote(params.id, actor, Number(body.cents), note)
    else if (body.action === 'draft') {
      const text = await saveLicenseDraft(params.id, actor)
      return NextResponse.json({ ok: true, agreement: text })
    } else if (body.action === 'review') await markAgreementReviewed(params.id, actor, note)
    else if (body.action === 'activate') {
      const licensePublicId = await activateLicensingInquiry(params.id, actor, note)
      return NextResponse.json({ ok: true, licensePublicId })
    } else return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update the inquiry.' }, { status: 400 })
  }
}
