import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getVideos() {
  const filePath = join(process.cwd(), 'web', 'data', 'videos.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveVideos(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'videos.json')
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

    const data = await getVideos()
    data.videos = data.videos.filter((v: any) => v.id !== params.id)
    await saveVideos(data)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting video:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
