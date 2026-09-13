import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import {
  OG_MOSAIC_CELLS,
  OG_MOSAIC_COLS,
  OG_MOSAIC_ROWS,
  buildOgMosaicIndices,
  loadOgMosaicTiles,
} from '@/lib/og-mosaic'

/** Node runtime: read gallery + cover tiles from disk for the mosaic collage. */
export const runtime = 'nodejs'

/** Bump when the card design changes so social caches re-fetch. */
const OG_IMAGE_VERSION = '20260311b'

const OG_IMAGE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}

function findRelease(slug: string) {
  const fromReleases = releasesData.releases.find((r: any) => r.id === slug)
  const fromSchedule = releaseSchedule.schedule.find((r) => r.id === slug)
  if (!fromReleases && !fromSchedule) return null
  return {
    title: fromSchedule?.title || fromReleases?.title || '',
    type: fromSchedule?.type || fromReleases?.type || '',
    genre: fromSchedule?.genre || '',
    description: fromSchedule?.description || '',
    release_date: fromSchedule?.release_date || (fromReleases as any)?.release_date || '',
    year: (fromReleases as any)?.year,
    status: fromSchedule?.status || (fromReleases as any)?.status || 'released',
  }
}

async function loadSixCapsFont(): Promise<ArrayBuffer> {
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=Six+Caps&text=SERGIKABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    {
      headers: {
        // Google returns TTF for this UA; Satori needs truetype, not woff2.
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      next: { revalidate: 86400 },
    },
  ).then((res) => res.text())

  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)
  if (!match?.[1]) {
    throw new Error('Six Caps font URL not found')
  }

  const fontRes = await fetch(match[1], { next: { revalidate: 86400 } })
  if (!fontRes.ok) {
    throw new Error(`Failed to download Six Caps (${fontRes.status})`)
  }
  return fontRes.arrayBuffer()
}

function ogFonts(sixCaps: ArrayBuffer) {
  return [
    {
      name: 'Six Caps',
      data: sixCaps,
      style: 'normal' as const,
      weight: 400 as const,
    },
  ]
}

function MosaicBackground({
  tiles,
}: {
  tiles: { dataUrl: string }[]
}) {
  if (tiles.length === 0) return null

  const indices = buildOgMosaicIndices(tiles.length)
  const cellW = 1200 / OG_MOSAIC_COLS
  const cellH = 630 / OG_MOSAIC_ROWS

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexWrap: 'wrap',
        width: 1200,
        height: 630,
      }}
    >
      {indices.slice(0, OG_MOSAIC_CELLS).map((tileIndex, cell) => {
        const tile = tiles[tileIndex] || tiles[cell % tiles.length]
        if (!tile) return null
        return (
          <img
            key={cell}
            src={tile.dataUrl}
            alt=""
            width={Math.ceil(cellW)}
            height={Math.ceil(cellH)}
            style={{
              width: `${100 / OG_MOSAIC_COLS}%`,
              height: `${100 / OG_MOSAIC_ROWS}%`,
              objectFit: 'cover',
              opacity: 0.55,
            }}
          />
        )
      })}
    </div>
  )
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin
    const releaseSlug = request.nextUrl.searchParams.get('release')
    const [sixCaps, mosaicTiles] = await Promise.all([
      loadSixCapsFont(),
      loadOgMosaicTiles({ origin, limit: 40 }),
    ])

    // Per-release OG image
    if (releaseSlug) {
      const release = findRelease(releaseSlug)
      if (release) {
        const isUpcoming = release.status === 'upcoming' || release.status === 'scheduled'
        const yearText = release.release_date
          ? new Date(release.release_date).getFullYear()
          : release.year || ''

        return new ImageResponse(
          (
            <div
              style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#000000',
                position: 'relative',
                overflow: 'hidden',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              <MosaicBackground tiles={mosaicTiles} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.82) 100%)',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 40px',
                  textAlign: 'center',
                  zIndex: 1,
                }}
              >
                {isUpcoming && (
                  <div
                    style={{
                      fontSize: 18,
                      color: 'rgba(255,255,255,0.55)',
                      marginBottom: 16,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontWeight: 600,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    Coming Soon
                  </div>
                )}
                <div
                  style={{
                    fontSize: 42,
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: 18,
                    letterSpacing: '0.18em',
                    fontFamily: 'Six Caps',
                    textTransform: 'uppercase',
                  }}
                >
                  SERGIK
                </div>
                <h1
                  style={{
                    fontSize: 72,
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: 0,
                    marginBottom: 16,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.05,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {release.title}
                </h1>
                <p
                  style={{
                    fontSize: 26,
                    color: '#9CA3AF',
                    margin: 0,
                    marginBottom: 12,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {release.type} {yearText && `· ${yearText}`}
                </p>
                {release.genre && (
                  <p
                    style={{
                      fontSize: 20,
                      color: '#6B7280',
                      margin: 0,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    {release.genre}
                  </p>
                )}
              </div>
            </div>
          ),
          { width: 1200, height: 630, fonts: ogFonts(sixCaps), headers: OG_IMAGE_HEADERS },
        )
      }
    }

    // Default OG image — Six Caps hero over gallery + cover-art mosaic
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <MosaicBackground tiles={mosaicTiles} />

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%)',
            }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 48px',
              zIndex: 1,
              textAlign: 'center',
              width: '100%',
            }}
          >
            <h1
              style={{
                fontSize: 180,
                fontWeight: 400,
                color: '#FFFFFF',
                margin: 0,
                marginBottom: 20,
                letterSpacing: '4.8px',
                fontFamily: 'Six Caps',
                textTransform: 'uppercase',
                lineHeight: 0.9,
              }}
            >
              SERGIK
            </h1>

            <p
              style={{
                fontSize: 24,
                color: 'rgba(229, 231, 235, 0.92)',
                margin: 0,
                marginBottom: 36,
                maxWidth: 820,
                lineHeight: 1.45,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {artistData.bio.short || 'Electronic Music Producer & DJ'}
            </p>

            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 8,
              }}
            >
              <div
                style={{
                  padding: '14px 36px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  borderRadius: 10,
                  fontSize: 20,
                  fontWeight: 600,
                  minWidth: 140,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Listen
              </div>
              <div
                style={{
                  padding: '14px 36px',
                  border: '2px solid rgba(255,255,255,0.85)',
                  color: '#FFFFFF',
                  borderRadius: 10,
                  fontSize: 20,
                  fontWeight: 600,
                  minWidth: 140,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Watch
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: ogFonts(sixCaps),
        headers: OG_IMAGE_HEADERS,
      },
    )
  } catch (e: any) {
    console.error('Error generating OG image:', e)
    return new Response(`Failed to generate the image: ${e.message}`, {
      status: 500,
    })
  }
}
