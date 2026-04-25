import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getReleases() {
  const filePath = join(process.cwd(), 'web', 'data', 'releases.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveReleases(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'releases.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getReleases()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching releases:', error)
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

    const release = await request.json()
    const data = await getReleases()

    const existingIndex = data.releases.findIndex((r: any) => r.id === release.id)
    if (existingIndex >= 0) {
      data.releases[existingIndex] = release
    } else {
      data.releases.push(release)
    }

    await saveReleases(data)
    return NextResponse.json({ success: true, release })
  } catch (error: any) {
    console.error('Error saving release:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
