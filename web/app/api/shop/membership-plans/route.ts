import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const plansData = await import('@/data/membership-plans.json')
    return NextResponse.json({ plans: plansData.plans })
  } catch (error: any) {
    console.error('Error loading membership plans:', error)
    return NextResponse.json({ plans: [] })
  }
}
