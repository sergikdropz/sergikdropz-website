import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSoundExchangeClient, buildLocalLookupResult, normalizeIsrcInput } from '@/lib/studio/soundexchange'
import { findCatalogHit, loadSoundExchangeRegistry } from '@/lib/studio/soundexchange-registry'

/**
 * GET /api/studio/soundexchange/lookup?isrc=
 * Local catalog lookup always; remote stub when credentials exist.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isrcParam = new URL(request.url).searchParams.get('isrc')
    if (!isrcParam) {
      return NextResponse.json({ error: 'isrc parameter required' }, { status: 400 })
    }

    const normalized = normalizeIsrcInput(isrcParam)
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid ISRC format' }, { status: 400 })
    }

    const registry = await loadSoundExchangeRegistry()
    const hit = findCatalogHit(registry.catalog, normalized)
    const client = createSoundExchangeClient()
    const remote = await client.lookupISRC(normalized)

    return NextResponse.json(
      buildLocalLookupResult({
        isrc: normalized,
        hit,
        remoteConfigured: registry.configured,
        remote,
      }),
    )
  } catch (error: unknown) {
    console.error('SoundExchange lookup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to lookup ISRC' },
      { status: 500 },
    )
  }
}
