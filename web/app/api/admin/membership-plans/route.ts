import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getMembershipPlans() {
  const filePath = join(process.cwd(), 'web', 'data', 'membership-plans.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveMembershipPlans(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'membership-plans.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getMembershipPlans()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching membership plans:', error)
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
    const data = await getMembershipPlans()

    // Update specific plan or entire plans array
    if (updates.plans) {
      data.plans = updates.plans
    } else if (updates.planId && updates.updates) {
      const index = data.plans.findIndex((p: any) => p.id === updates.planId)
      if (index === -1) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      data.plans[index] = { ...data.plans[index], ...updates.updates }
    }

    await saveMembershipPlans(data)
    return NextResponse.json({ success: true, plans: data.plans })
  } catch (error: any) {
    console.error('Error updating membership plans:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
