import { NextRequest, NextResponse } from 'next/server'
import { applyShareDownloadCookie } from '@/lib/shares/share-download-cookie'
import { shareDownloadUrl, type ShareDownloadSelection } from '@/lib/shares/share-download'
import { grantFromDownloadCode } from '@/lib/shares/share-download-server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { resolvePublicOrigin } from '@/lib/shares/types'

export const dynamic = 'force-dynamic'

function expiredPage() {
  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><title>Download link expired</title><body style="margin:0;background:#050505;color:#f5f5f5;font-family:sans-serif;padding:2.5rem"><p>This download link expired or is no longer valid.</p><p>Open the share page and enter your email to get a new one.</p></body>',
    { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code') || ''
    const unlocked = await grantFromDownloadCode(code)
    if (!unlocked) return expiredPage()
    const supabase = createSupabaseServerClient()
    const share = await supabase
      .from('music_share_links')
      .select('token')
      .eq('id', unlocked.grant.shareId)
      .maybeSingle()
    if (share.error || !share.data?.token) return expiredPage()
    const selection: ShareDownloadSelection = {
      format: unlocked.grant.format,
      scope: unlocked.grant.scope,
      trackId: unlocked.grant.trackId,
    }
    const dest = shareDownloadUrl(resolvePublicOrigin(request.headers), String(share.data.token), selection)
    const response = NextResponse.redirect(dest)
    applyShareDownloadCookie(response, request, unlocked.email, unlocked.grant.id)
    return response
  } catch (error) {
    console.error('GET download open:', error)
    return expiredPage()
  }
}
