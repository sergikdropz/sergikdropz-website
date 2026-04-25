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

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getBundles()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching bundles:', error)
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

    const bundle = await request.json()
    const data = await getBundles()

    const existingIndex = data.bundles.findIndex((b: any) => b.id === bundle.id)
    if (existingIndex >= 0) {
      data.bundles[existingIndex] = bundle
    } else {
      data.bundles.push(bundle)
    }

    await saveBundles(data)
    return NextResponse.json({ success: true, bundle })
  } catch (error: any) {
    console.error('Error saving bundle:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
