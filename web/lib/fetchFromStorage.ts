/**
 * Fetch JSONB Data from Supabase Storage
 * 
 * After migration, large JSONB columns are stored as JSON files in storage.
 * This utility fetches them on-demand with caching.
 */

// In-memory cache for fetched storage data
const storageCache = new Map<string, { data: any; expiresAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_ENTRIES = 64

/**
 * Fetch JSON data from a storage URL
 */
export async function fetchJsonFromStorage(url: string | null): Promise<any | null> {
  if (!url) return null
  
  // Check cache first
  const cached = storageCache.get(url)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }
  
  try {
    const response = await fetch(url, {
      cache: 'force-cache', // Browser caching
      headers: {
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.warn(`Failed to fetch from storage: ${url} (${response.status})`)
      return null
    }
    
    const data = await response.json()

    // Cache the result (LRU cap — waveform/sonic JSON blobs can be large)
    if (storageCache.has(url)) storageCache.delete(url)
    storageCache.set(url, {
      data,
      expiresAt: Date.now() + CACHE_TTL,
    })
    while (storageCache.size > MAX_CACHE_ENTRIES) {
      const oldest = storageCache.keys().next().value
      if (oldest) storageCache.delete(oldest)
    }

    return data
  } catch (error) {
    console.error(`Error fetching from storage: ${url}`, error)
    return null
  }
}

/**
 * Fetch waveform data from storage or database
 * Handles backward compatibility
 */
export async function fetchWaveformData(record: {
  waveform_data?: any
  waveform_json_url?: string | null
}): Promise<number[] | null> {
  // Priority 1: Already have inline data (pre-migration)
  if (record.waveform_data && Array.isArray(record.waveform_data) && record.waveform_data.length > 0) {
    return record.waveform_data
  }
  
  // Priority 2: Fetch from storage URL (post-migration)
  if (record.waveform_json_url) {
    return await fetchJsonFromStorage(record.waveform_json_url)
  }
  
  return null
}

/**
 * Fetch Sonic DNA from storage or database
 * Handles backward compatibility
 */
export async function fetchSonicDNA(record: {
  sonic_dna?: any
  sonic_dna_json_url?: string | null
}): Promise<any | null> {
  // Priority 1: Already have inline data (pre-migration)
  if (record.sonic_dna && Object.keys(record.sonic_dna).length > 0) {
    return record.sonic_dna
  }
  
  // Priority 2: Fetch from storage URL (post-migration)
  if (record.sonic_dna_json_url) {
    return await fetchJsonFromStorage(record.sonic_dna_json_url)
  }
  
  return null
}

/**
 * Clear the storage cache (useful for testing)
 */
export function clearStorageCache() {
  storageCache.clear()
}

/**
 * Get cache statistics
 */
export function getStorageCacheStats() {
  return {
    size: storageCache.size,
    entries: Array.from(storageCache.keys()),
  }
}
