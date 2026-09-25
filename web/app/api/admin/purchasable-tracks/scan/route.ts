import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable } from '@/lib/supabaseReachability'
import {
  mergePurchasableTracksFromScan,
  scanDistributionForPurchasableTracks,
  type ShopStoreScanMode,
} from '@/lib/shop/sync-purchasable-from-distribution'
import {
  readPurchasableTracksFile,
  writePurchasableTracksFile,
} from '@/lib/shop/purchasable-data-file'

export const dynamic = 'force-dynamic'

function parseMode(raw: unknown): ShopStoreScanMode {
  return raw === 'full_targets' ? 'full_targets' : 'core'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await supabaseIsReachable())) {
      return NextResponse.json({ error: 'Supabase unreachable' }, { status: 503 })
    }

    const mode = parseMode(request.nextUrl.searchParams.get('mode'))
    const supabase = createSupabaseServerClient()
    const scan = await scanDistributionForPurchasableTracks(supabase, mode)
    const existing = await readPurchasableTracksFile()

    return NextResponse.json({
      dryRun: true,
      ...scan,
      existingCount: existing.tracks.length,
      mergedCount: mergePurchasableTracksFromScan(existing.tracks, scan.candidates).length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    console.error('[purchasable-tracks/scan GET]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await supabaseIsReachable())) {
      return NextResponse.json({ error: 'Supabase unreachable' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const mode = parseMode(body.mode)
    const supabase = createSupabaseServerClient()
    const scan = await scanDistributionForPurchasableTracks(supabase, mode)
    const existing = await readPurchasableTracksFile()
    const merged = mergePurchasableTracksFromScan(existing.tracks, scan.candidates)

    await writePurchasableTracksFile({
      ...existing,
      tracks: merged,
      lastDistributionScanAt: scan.scannedAt,
    })

    return NextResponse.json({
      dryRun: false,
      ...scan,
      importedCount: scan.candidates.length,
      totalTracks: merged.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed'
    console.error('[purchasable-tracks/scan POST]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
