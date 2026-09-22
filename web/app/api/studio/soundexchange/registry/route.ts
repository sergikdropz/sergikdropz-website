import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { loadSoundExchangeRegistry, lockerCsvFromCatalog } from '@/lib/studio/soundexchange-registry'

/**
 * GET /api/studio/soundexchange/registry
 * Catalog ISRCs + submission status for Pipeline → ISRCs.
 * ?format=csv downloads USISRC locker CSV (pending by default, all with scope=all).
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const format = url.searchParams.get('format')
    const scope = url.searchParams.get('scope') || 'pending'
    const registry = await loadSoundExchangeRegistry()

    if (format === 'csv') {
      const rows = scope === 'all' ? registry.catalog : registry.pending
      const csv = lockerCsvFromCatalog(rows)
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sergik-usisrc-locker-${scope}.csv"`,
        },
      })
    }

    return NextResponse.json(registry)
  } catch (error: unknown) {
    console.error('SoundExchange registry error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load registry' },
      { status: 500 },
    )
  }
}
