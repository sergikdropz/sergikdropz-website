import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getTipConfig() {
  const filePath = join(process.cwd(), 'web', 'data', 'tip-jar-config.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveTipConfig(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'tip-jar-config.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getTipConfig()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching tip config:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()
    const current = await getTipConfig()
    const updated = { ...current, ...updates }

    await saveTipConfig(updated)
    return NextResponse.json({ success: true, config: updated })
  } catch (error: any) {
    console.error('Error updating tip config:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
