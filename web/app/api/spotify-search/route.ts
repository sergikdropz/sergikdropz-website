import { NextResponse } from 'next/server'

// API route to search Spotify for tracks/albums
// This uses Spotify's public embed API for searching

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const type = searchParams.get('type') || 'track'

  if (!query) {
    return NextResponse.json(
      { error: 'Search query is required' },
      { status: 400 }
    )
  }

  try {
    // Note: Spotify's public API doesn't have a search endpoint without auth
    // This is a placeholder - in production you'd use Spotify Web API with credentials
    // For now, we'll return instructions
    
    return NextResponse.json({
      message: 'Spotify search requires Web API credentials',
      instructions: [
        '1. Get Spotify Web API credentials from https://developer.spotify.com',
        '2. Use the Search API endpoint: https://api.spotify.com/v1/search',
        '3. Search for tracks/albums and get their artwork URLs',
        '4. Update releases.json with the track/album URLs and artwork'
      ],
      alternative: 'You can manually find track URLs on Spotify and use the /api/spotify-artwork endpoint'
    })
  } catch (error) {
    console.error('Error searching Spotify:', error)
    return NextResponse.json(
      { error: 'Failed to search Spotify' },
      { status: 500 }
    )
  }
}

