import { NextResponse } from 'next/server'
import { getMusicLibraryPublishVersion } from '@/lib/music-library-publish'

export const dynamic = 'force-dynamic'

/**
 * GET /api/music-library/catalog-version
 * Public cache-buster for the live music library after an admin publish.
 * Short CDN/browser window reduces hammering settings on every poll / cold hop.
 */
export async function GET() {
  const version = await getMusicLibraryPublishVersion()
  return NextResponse.json(
    { version },
    {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30',
      },
    },
  )
}
