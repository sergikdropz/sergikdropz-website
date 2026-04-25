import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getLicenseTiers() {
  const filePath = join(process.cwd(), 'web', 'data', 'license-tiers.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveLicenseTiers(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'license-tiers.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getLicenseTiers()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching license tiers:', error)
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
    const data = await getLicenseTiers()

    if (updates.tiers) {
      data.tiers = updates.tiers
    } else if (updates.tierId && updates.updates) {
      const index = data.tiers.findIndex((t: any) => t.id === updates.tierId)
      if (index === -1) {
        return NextResponse.json({ error: 'Tier not found' }, { status: 404 })
      }
      data.tiers[index] = { ...data.tiers[index], ...updates.updates }
    }

    await saveLicenseTiers(data)
    return NextResponse.json({ success: true, tiers: data.tiers })
  } catch (error: any) {
    console.error('Error updating license tiers:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
