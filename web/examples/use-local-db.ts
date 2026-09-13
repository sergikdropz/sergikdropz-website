/**
 * Example: Using Local Database Client
 * 
 * This shows how to use the LocalDB client to work with exported Supabase data
 */

import { LocalDB } from '@/lib/local-db'

// Example 1: Get all audio files
export async function getAllTracks() {
  const tracks = await LocalDB.getAll('audio_files')
  console.log(`Found ${tracks.length} tracks`)
  return tracks
}

// Example 2: Query with filters
export async function getSergikTracks() {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { artist: 'SERGIK' },
    limit: 10,
    orderBy: 'created_at',
    orderDirection: 'desc'
  })
  return tracks
}

// Example 3: Find specific track
export async function getTrackById(trackId: string) {
  const track = await LocalDB.findById('audio_files', trackId)
  return track
}

// Example 4: Count tracks
export async function countTracks() {
  const total = await LocalDB.count('audio_files')
  const sergikTracks = await LocalDB.count('audio_files', { artist: 'SERGIK' })
  
  return {
    total,
    sergikTracks
  }
}

// Example 5: Search tracks by title
export async function searchTracks(searchTerm: string) {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { title: searchTerm }, // Partial match
    limit: 20
  })
  return tracks
}

// Example 6: Get tracks with completed analysis
export async function getAnalyzedTracks() {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { analysis_status: 'completed' },
    orderBy: 'analyzed_at',
    orderDirection: 'desc'
  })
  return tracks
}

// Example 7: Get tracks with Sonic DNA
export async function getTracksWithSonicDNA() {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { sonic_dna_status: 'completed' }
  })
  return tracks
}

// Example 8: Get purchasable tracks
export async function getPurchasableTracks() {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { is_purchasable: true },
    orderBy: 'price_usd',
    orderDirection: 'asc'
  })
  return tracks
}

// Example 9: Get tracks by format
export async function getTracksByFormat(format: string) {
  const tracks = await LocalDB.query({
    table: 'audio_files',
    filters: { format: format.toUpperCase() }
  })
  return tracks
}

// Example 10: Pagination
export async function getTracksPaginated(page: number = 1, pageSize: number = 20) {
  const offset = (page - 1) * pageSize
  
  const tracks = await LocalDB.query({
    table: 'audio_files',
    limit: pageSize,
    offset: offset,
    orderBy: 'created_at',
    orderDirection: 'desc'
  })
  
  const total = await LocalDB.count('audio_files')
  
  return {
    tracks,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: offset + pageSize < total,
      hasPrev: page > 1
    }
  }
}

