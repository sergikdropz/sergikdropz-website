import { NextResponse } from 'next/server'
import { readShopBackdropSetting } from '@/lib/merch/shop-backdrop-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const backdrop = await readShopBackdropSetting()
  return NextResponse.json({ backdrop })
}
