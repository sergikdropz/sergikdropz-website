import { NextResponse } from 'next/server'
import { readLocalMerchArt } from '@/lib/merch/art-store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function GET(_request: Request, { params }: Params) {
  const art = await readLocalMerchArt(params.id)
  if (!art) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(art.bytes), {
    headers: {
      'Content-Type': art.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
