import { NextResponse } from 'next/server'

// API route to fetch Spotify album artwork
// Uses Spotify's oEmbed API which doesn't require authentication

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
    // Use Spotify's oEmbed API
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    const response = await fetch(oembedUrl)
    const data = await response.json()

    if (data.thumbnail_url) {
      return NextResponse.json({
        imageUrl: data.thumbnail_url,
        width: data.thumbnail_width,
        height: data.thumbnail_height,
      })
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

