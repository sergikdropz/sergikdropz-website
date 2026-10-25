import { NextResponse } from 'next/server'
import { confirmLicensingEmail } from '@/lib/licensing/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim() || ''
  if (!token) return NextResponse.redirect(new URL('/licensing?confirmed=0', request.url))
  const result = await confirmLicensingEmail(token)
  const target = new URL('/licensing', request.url)
  target.searchParams.set('confirmed', result.ok ? '1' : '0')
  if (result.ok) target.searchParams.set('inquiry', result.publicId)
  return NextResponse.redirect(target)
}
