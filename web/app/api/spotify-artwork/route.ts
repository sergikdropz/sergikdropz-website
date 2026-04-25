import { NextResponse } from 'next/server'

const CACHE_SECONDS = 86400 // 24 hours — artwork URLs rarely change

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const spotifyUrl = searchParams.get('url')

  if (!spotifyUrl) {
    return NextResponse.json(
      { error: 'Spotify URL is required' },
      { status: 400 }
    )
  }

  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    const response = await fetch(oembedUrl, {
      next: { revalidate: CACHE_SECONDS },
    })
    const data = await response.json()

    if (data.thumbnail_url) {
      return NextResponse.json(
        {
          imageUrl: data.thumbnail_url,
          width: data.thumbnail_width,
          height: data.thumbnail_height,
        },
        {
          headers: {
            'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 7}`,
          },
        },
      )
    }

    return NextResponse.json(
      { error: 'No artwork found' },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error fetching Spotify artwork:', error)
    return NextResponse.json(
      { error: 'Failed to fetch artwork' },
      { status: 500 }
    )
  }
}

