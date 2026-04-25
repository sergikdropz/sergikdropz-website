import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getPurchasableTracks() {
  const filePath = join(process.cwd(), 'web', 'data', 'purchasable-tracks.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function savePurchasableTracks(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'purchasable-tracks.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getPurchasableTracks()
    data.tracks = data.tracks.filter((t: any) => t.id !== params.id)
    await savePurchasableTracks(data)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting track:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
