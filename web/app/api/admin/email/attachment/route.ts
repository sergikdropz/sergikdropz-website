import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/email/attachment?message=&file=
 * Download a file stored with a department-mail message (admin-only).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const messageId = request.nextUrl.searchParams.get('message') || ''
  const filename = request.nextUrl.searchParams.get('file') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId) || !filename) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('department_mail_messages')
    .select('attachments')
    .eq('id', messageId)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

  const rows = Array.isArray(data.attachments) ? data.attachments : []
  const match = rows.find((row) => {
    if (!row || typeof row !== 'object') return false
    return String((row as { filename?: unknown }).filename || '') === filename
  }) as { contentBase64?: unknown; contentType?: unknown } | undefined
  const encoded = typeof match?.contentBase64 === 'string' ? match.contentBase64 : ''
  if (!encoded) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  const safeName = filename.replace(/[\r\n"]/g, '').slice(0, 120) || 'file'
  const contentType = String(match?.contentType || 'application/octet-stream').slice(0, 120)
  const inline = request.nextUrl.searchParams.get('inline') === '1'
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
