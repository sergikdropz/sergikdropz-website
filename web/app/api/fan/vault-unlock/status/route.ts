import { NextRequest, NextResponse } from 'next/server'
import { getFanVaultUnlockEmailFromRequest } from '@/lib/fan-vault-unlock-cookie'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const email = getFanVaultUnlockEmailFromRequest(request)
  return NextResponse.json(
    {
      unlocked: !!email,
      email: email || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
