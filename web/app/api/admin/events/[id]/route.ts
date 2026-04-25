import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getEvents() {
  const filePath = join(process.cwd(), 'web', 'data', 'events.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveEvents(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'events.json')
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

    const data = await getEvents()
    data.events = data.events.filter((e: any) => e.id !== params.id)
    await saveEvents(data)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting event:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
