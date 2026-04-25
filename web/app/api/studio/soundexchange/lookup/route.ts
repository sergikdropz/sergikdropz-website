import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSoundExchangeClient } from '@/lib/studio/soundexchange'

/**
 * GET /api/studio/soundexchange/lookup
 * Lookup ISRC in SoundExchange database
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const isrc = searchParams.get('isrc')

    if (!isrc) {
      return NextResponse.json(
        { error: 'isrc parameter required' },
        { status: 400 }
      )
    }

    // Create SoundExchange client
    const soundExchange = createSoundExchangeClient()
    if (!soundExchange) {
      return NextResponse.json(
        { 
          error: 'SoundExchange API not configured',
          configured: false,
        },
        { status: 500 }
      )
    }

    // Lookup ISRC
    const result = await soundExchange.lookupISRC(isrc)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('SoundExchange lookup error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to lookup ISRC' },
      { status: 500 }
    )
  }
}
