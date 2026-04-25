import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Track {
  id: string
  folderId?: string
  audioFileId?: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  bpm?: number
  key_signature?: string
  sonic_dna?: any
  created_at?: string
  date?: string
  year?: number
  folder?: string
  energy_level?: number
  danceability?: number
}

export interface FolderItem {
  id: string
  name: string
  type: 'folder' | 'album' | 'ep' | 'single' | 'remix' | 'track'
  parentId: string | null
  children?: FolderItem[]
  tracks?: Track[]
  artwork?: string
  year?: number
  hidden?: boolean
}

export interface MusicLibraryData {
  description: string
  folders: FolderItem[]
  playlists: any[]
}

// Query keys for consistent caching
export const queryKeys = {
  musicLibrary: ['musicLibrary'] as const,
  tracks: (folderId?: string) => ['tracks', folderId] as const,
  track: (trackId: string) => ['track', trackId] as const,
  sonicDna: (trackId: string) => ['sonicDna', trackId] as const,
  waveform: (trackId: string) => ['waveform', trackId] as const,
}

// Fetch music library data
async function fetchMusicLibrary(): Promise<MusicLibraryData> {
  const response = await fetch('/api/music-library/sync')
  if (!response.ok) {
    throw new Error('Failed to fetch music library')
  }
  return response.json()
}

// Fetch tracks for a specific folder
async function fetchTracks(folderId?: string): Promise<Track[]> {
  const url = folderId
    ? `/api/music-library/tracks?folderId=${folderId}`
    : '/api/music-library/tracks'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch tracks')
  }
  const data = await response.json()
  return data.tracks || []
}

// Fetch detailed sonic DNA for a track (lazy loaded)
async function fetchSonicDna(trackId: string): Promise<any> {
  const response = await fetch(`/api/audio/sonic-dna?trackId=${trackId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch sonic DNA')
  }
  return response.json()
}

// Fetch waveform data for a track (lazy loaded)
async function fetchWaveform(trackId: string): Promise<any> {
  const response = await fetch(`/api/audio/waveform?trackId=${trackId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch waveform')
  }
  return response.json()
}

// React Query hooks

export function useMusicLibrary() {
  return useQuery({
    queryKey: queryKeys.musicLibrary,
    queryFn: fetchMusicLibrary,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useTracks(folderId?: string) {
  return useQuery({
    queryKey: queryKeys.tracks(folderId),
    queryFn: () => fetchTracks(folderId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    // Don't refetch on mount if we have cached data
    refetchOnMount: false,
  })
}

export function useTrack(trackId: string) {
  return useQuery({
    queryKey: queryKeys.track(trackId),
    queryFn: () => fetchTracks().then(tracks => tracks.find(t => t.id === trackId)),
    enabled: !!trackId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useSonicDna(trackId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sonicDna(trackId),
    queryFn: () => fetchSonicDna(trackId),
    enabled: !!trackId && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes (sonic DNA doesn't change often)
    gcTime: 30 * 60 * 1000, // 30 minutes
    // Don't retry failed sonic DNA fetches (might not exist)
    retry: 1,
  })
}

export function useWaveform(trackId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.waveform(trackId),
    queryFn: () => fetchWaveform(trackId),
    enabled: !!trackId && enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  })
}

// Prefetch hooks for performance optimization
export function usePrefetchTracks() {
  const queryClient = useQueryClient()

  const prefetchTracks = (folderId?: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.tracks(folderId),
      queryFn: () => fetchTracks(folderId),
      staleTime: 5 * 60 * 1000,
    })
  }

  const prefetchSonicDna = (trackId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.sonicDna(trackId),
      queryFn: () => fetchSonicDna(trackId),
      staleTime: 10 * 60 * 1000,
    })
  }

  const prefetchWaveform = (trackId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.waveform(trackId),
      queryFn: () => fetchWaveform(trackId),
      staleTime: 10 * 60 * 1000,
    })
  }

  return { prefetchTracks, prefetchSonicDna, prefetchWaveform }
}