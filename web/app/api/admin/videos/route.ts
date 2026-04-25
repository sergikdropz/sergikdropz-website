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

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getVideos()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching videos:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const video = await request.json()
    const data = await getVideos()

    const existingIndex = data.videos.findIndex((v: any) => v.id === video.id)
    if (existingIndex >= 0) {
      data.videos[existingIndex] = video
    } else {
      data.videos.push(video)
    }

    await saveVideos(data)
    return NextResponse.json({ success: true, video })
  } catch (error: any) {
    console.error('Error saving video:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
