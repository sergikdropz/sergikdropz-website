import { NextResponse } from 'next/server'
import { acceptLicensingQuote, clientInquiryView, getInquiryByClientToken } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

type Params = { params: { token: string } }

export async function GET(_request: Request, { params }: Params) {
  const row = await getInquiryByClientToken(params.token)
  if (!row) return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
  return NextResponse.json(clientInquiryView(row))
}

export async function POST(request: Request, { params }: Params) {
  try {
    const body = (await request.json()) as { action?: string }
    if (body.action !== 'accept_quote') return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
    await acceptLicensingQuote(params.token)
    const row = await getInquiryByClientToken(params.token)
    return NextResponse.json(row ? clientInquiryView(row) : { ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update the quote.' }, { status: 400 })
  }
}
