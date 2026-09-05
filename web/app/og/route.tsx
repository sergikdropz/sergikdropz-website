import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'

export const runtime = 'edge'

const OG_IMAGE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
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

export async function GET(request: NextRequest) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
    const releaseSlug = request.nextUrl.searchParams.get('release')

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
                backgroundImage: isUpcoming
                  ? 'linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%)'
                  : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 40px',
                  textAlign: 'center',
                }}
              >
                {isUpcoming && (
                  <div
                    style={{
                      fontSize: 18,
                      color: '#A78BFA',
                      marginBottom: 16,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    Coming Soon
                  </div>
                )}
                <h1
                  style={{
                    fontSize: 80,
                    fontWeight: 'bold',
                    color: '#FFFFFF',
                    margin: 0,
                    marginBottom: 16,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {release.title}
                </h1>
                <p
                  style={{
                    fontSize: 28,
                    color: '#9CA3AF',
                    margin: 0,
                    marginBottom: 12,
                  }}
                >
                  SERGIK &middot; {release.type} {yearText && `&middot; ${yearText}`}
                </p>
                {release.genre && (
                  <p
                    style={{
                      fontSize: 20,
                      color: '#6B7280',
                      margin: 0,
                    }}
                  >
                    {release.genre}
                  </p>
                )}
              </div>
            </div>
          ),
          { width: 1200, height: 630, headers: OG_IMAGE_HEADERS }
        )
      }
    }

    // Default OG image
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
            backgroundImage: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
            position: 'relative',
          }}
        >
          {/* Background gradient overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.8) 100%)',
            }}
          />
          
          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '80px 40px',
              zIndex: 1,
              textAlign: 'center',
            }}
          >
            {/* SERGIK Title */}
            <h1
              style={{
                fontSize: 120,
                fontWeight: 'bold',
                color: '#FFFFFF',
                margin: 0,
                marginBottom: 24,
                letterSpacing: '-0.02em',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              SERGIK
            </h1>
            
            {/* Bio text */}
            <p
              style={{
                fontSize: 24,
                color: '#E5E7EB',
                margin: 0,
                marginBottom: 40,
                maxWidth: 800,
                lineHeight: 1.5,
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              }}
            >
              {artistData.bio.short || 'Electronic Music Producer & DJ'}
            </p>
            
            {/* Action buttons preview */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 20,
              }}
            >
              <div
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                Listen
              </div>
              <div
                style={{
                  padding: '12px 24px',
                  border: '2px solid #FFFFFF',
                  color: '#FFFFFF',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
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
        headers: OG_IMAGE_HEADERS,
      }
    )
  } catch (e: any) {
    console.error('Error generating OG image:', e)
    return new Response(`Failed to generate the image: ${e.message}`, {
      status: 500,
    })
  }
}
