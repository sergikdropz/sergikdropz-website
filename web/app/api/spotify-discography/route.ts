import { NextResponse } from 'next/server'

/**
 * API route to fetch SERGIK's discography from Spotify
 * This uses Spotify Web API - requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
 * 
 * To use:
 * 1. Get credentials from https://developer.spotify.com/dashboard
 * 2. Add to .env.local:
 *    SPOTIFY_CLIENT_ID=your_client_id
 *    SPOTIFY_CLIENT_SECRET=your_client_secret
 * 3. Call: GET /api/spotify-discography
 */

const SPOTIFY_ARTIST_ID = '7MnvMhWoSe4wYXuiI6iQ8H'

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Error getting Spotify token:', error)
    return null
  }
}

async function fetchArtistAlbums(accessToken: string) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/artists/${SPOTIFY_ARTIST_ID}/albums?include_groups=album,single,ep&limit=50`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch albums')
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching albums:', error)
    return null
  }
}

export async function GET() {
  const accessToken = await getSpotifyAccessToken()

  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'Spotify API credentials not configured',
        message: 'Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env.local',
        instructions: [
          '1. Visit https://developer.spotify.com/dashboard',
          '2. Create a new app',
          '3. Get Client ID and Client Secret',
          '4. Add them to .env.local file',
        ],
        manualMethod: 'Visit https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all and manually get URLs',
      },
      { status: 400 }
    )
  }

  const albumsData = await fetchArtistAlbums(accessToken)

  if (!albumsData) {
    return NextResponse.json(
      { error: 'Failed to fetch discography' },
      { status: 500 }
    )
  }

  // Map albums to our release format
  const releases = albumsData.items.map((album: any) => ({
    id: album.id,
    name: album.name,
    type: album.album_type === 'single' ? 'Single' : album.album_type.toUpperCase(),
    release_date: album.release_date,
    spotify_url: album.external_urls.spotify,
    image: album.images[0]?.url || null,
    image_small: album.images[2]?.url || album.images[0]?.url || null,
    image_large: album.images[0]?.url || null,
  }))

  return NextResponse.json({
    releases,
    total: releases.length,
  })
}

