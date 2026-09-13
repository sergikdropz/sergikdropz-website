/**
 * MusicBrainz API integration utilities
 * Provides access to comprehensive music metadata including genres, regions, and cultural data
 */

interface MusicBrainzArtist {
  id: string
  name: string
  type?: string
  area?: {
    name: string
    'iso-3166-1-codes'?: string[]
  }
  'begin-area'?: {
    name: string
  }
  'end-area'?: {
    name: string
  }
  tags?: Array<{
    name: string
    count: number
  }>
  genres?: Array<{
    name: string
    count: number
  }>
  aliases?: Array<{
    name: string
    'sort-name'?: string
  }>
  relations?: Array<{
    type: string
    artist?: {
      name: string
    }
    'target-type': string
  }>
}

interface MusicBrainzRelease {
  id: string
  title: string
  'release-group'?: {
    id: string
    'primary-type'?: string
    'secondary-types'?: string[]
    tags?: Array<{ name: string; count: number }>
  }
  date?: string
  country?: string
  'label-info'?: Array<{
    label?: {
      name: string
      area?: { name: string }
    }
  }>
}

const USER_AGENT = 'SERGIK-Website/1.0 (https://sergikdropz.com)'

/**
 * Search for an artist in MusicBrainz
 * @param artistName - Name of the artist to search for
 * @returns MusicBrainz artist data or null if not found
 */
export async function searchMusicBrainzArtist(artistName: string): Promise<MusicBrainzArtist | null> {
  try {
    const response = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(artistName)}"&fmt=json&limit=1`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    if (data.artists && data.artists.length > 0) {
      return data.artists[0]
    }
    
    return null
  } catch (error) {
    console.error('MusicBrainz search error:', error)
    return null
  }
}

/**
 * Get detailed artist information from MusicBrainz
 * @param mbid - MusicBrainz ID
 * @returns Detailed artist data including genres, tags, and relations
 */
export async function getMusicBrainzArtistDetails(mbid: string): Promise<MusicBrainzArtist | null> {
  try {
    const response = await fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=genres+tags+area-rels+artist-rels`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('MusicBrainz details error:', error)
    return null
  }
}

/**
 * Search for a release in MusicBrainz
 * @param artistName - Name of the artist
 * @param releaseTitle - Title of the release
 * @returns MusicBrainz release data or null if not found
 */
export async function searchMusicBrainzRelease(artistName: string, releaseTitle: string): Promise<MusicBrainzRelease | null> {
  try {
    const query = `artist:"${encodeURIComponent(artistName)}" AND release:"${encodeURIComponent(releaseTitle)}"`
    const response = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=1&inc=release-groups+labels`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    if (data.releases && data.releases.length > 0) {
      return data.releases[0]
    }
    
    return null
  } catch (error) {
    console.error('MusicBrainz release search error:', error)
    return null
  }
}

/**
 * Extract genres from MusicBrainz data
 * @param artistData - MusicBrainz artist data
 * @returns Array of genre names
 */
export function extractGenres(artistData: MusicBrainzArtist | null): string[] {
  if (!artistData) return []
  
  const genres: string[] = []
  
  // Get genres
  if (artistData.genres) {
    genres.push(...artistData.genres.map(g => g.name))
  }
  
  // Get tags (often contain genre information)
  if (artistData.tags) {
    const genreTags = artistData.tags
      .filter(tag => tag.count > 0)
      .map(tag => tag.name)
    genres.push(...genreTags)
  }
  
  // Remove duplicates and return
  return Array.from(new Set(genres))
}

/**
 * Extract regional/cultural information from MusicBrainz data
 * @param artistData - MusicBrainz artist data
 * @returns Object with regional information
 */
export function extractRegionalInfo(artistData: MusicBrainzArtist | null): {
  area?: string
  country?: string
  beginArea?: string
  endArea?: string
} {
  if (!artistData) return {}
  
  return {
    area: artistData.area?.name,
    country: artistData.area?.['iso-3166-1-codes']?.[0],
    beginArea: artistData['begin-area']?.name,
    endArea: artistData['end-area']?.name
  }
}

