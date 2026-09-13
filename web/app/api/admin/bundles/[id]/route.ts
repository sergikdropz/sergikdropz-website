import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getBundles() {
  const filePath = join(process.cwd(), 'web', 'data', 'bundles.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveBundles(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'bundles.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await request.json()
    const data = await getBundles()

    const index = data.bundles.findIndex((b: any) => b.id === params.id)
    if (index === -1) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    data.bundles[index] = { ...data.bundles[index], ...updates }
    await saveBundles(data)

    return NextResponse.json({ success: true, bundle: data.bundles[index] })
  } catch (error: any) {
    console.error('Error updating bundle:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
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

    const data = await getBundles()
    data.bundles = data.bundles.filter((b: any) => b.id !== params.id)
    await saveBundles(data)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting bundle:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
