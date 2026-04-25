import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getReleases() {
  const filePath = join(process.cwd(), 'web', 'data', 'releases.json')
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function saveReleases(data: any) {
  const filePath = join(process.cwd(), 'web', 'data', 'releases.json')
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getReleases()
    const release = data.releases.find((r: any) => r.id === params.id)

    if (!release || !release.spotify_url) {
      return NextResponse.json(
        { error: 'Release not found or no Spotify URL' },
        { status: 404 }
      )
    }

    // Fetch Spotify data
    const spotifyResponse = await fetch(
      `/api/spotify-discography?url=${encodeURIComponent(release.spotify_url)}`
    )
    const spotifyData = await spotifyResponse.json()

    if (spotifyData.album) {
      // Update release with Spotify data
      release.image = spotifyData.album.images?.[0]?.url || release.image
      release.title = spotifyData.album.name || release.title
      // Add more fields as needed

      await saveReleases(data)
      return NextResponse.json({ success: true, release })
    }

    return NextResponse.json({ error: 'Failed to fetch Spotify data' }, { status: 500 })
  } catch (error: any) {
    console.error('Error syncing Spotify:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
