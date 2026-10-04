import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { connectMetaFromUserToken, disconnectMetaPublisher } from '@/lib/meta/connection'

export const dynamic = 'force-dynamic'

/** Link the existing INSTAGRAM_ACCESS_TOKEN, or disconnect the stored Page token. */
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { disconnect?: boolean }
  if (body.disconnect) {
    await disconnectMetaPublisher()
    return NextResponse.json({ connected: false })
  }

  const token = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim()
  if (!token) {
    return NextResponse.json(
      { error: 'INSTAGRAM_ACCESS_TOKEN is not set. Use Connect Meta instead.' },
      { status: 409 }
    )
  }

  try {
    const status = await connectMetaFromUserToken(token)
    return NextResponse.json(status)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not link the Instagram token'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
