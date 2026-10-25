import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Email links land here, then open the vinyl download page. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id')?.trim() || ''
  const target = new URL('/download/order', request.url)
  if (sessionId) target.searchParams.set('session_id', sessionId)
  return NextResponse.redirect(target, 302)
}
