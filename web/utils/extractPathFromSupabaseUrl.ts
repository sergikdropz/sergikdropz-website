/**
 * Extract local file path from Supabase Storage URL
 * 
 * Converts: https://[project].supabase.co/storage/v1/object/public/audio-files/unreleased/eps/...
 * To: unreleased/eps/...
 */

export function extractPathFromSupabaseUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }
  
  // If it's already a local path (doesn't start with http), return as-is
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url
  }
  
  // Extract path from Supabase Storage URL
  // Pattern: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
  const supabaseStoragePattern = /\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/
  const match = url.match(supabaseStoragePattern)
  
  if (match) {
    const bucket = match[1]
    const path = match[2]
    
    // Decode URL encoding (%20 -> space, etc.)
    const decodedPath = decodeURIComponent(path)
    
    // For audio-files bucket, the path is already the storage path
    if (bucket === 'audio-files') {
      return decodedPath
    }
    
    // For other buckets, return the path as-is
    return decodedPath
  }
  
  // If it doesn't match Supabase pattern, return null
  return null
}
