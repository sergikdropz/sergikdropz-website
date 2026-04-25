/**
 * Resolve image URLs from Supabase Storage or local fallback
 * 
 * In production: Always resolves to Supabase Storage URLs
 * In development: Uses Supabase if available, falls back to local files
 */

const imageUrlCache = new Map<string, string>()
const MAX_CACHE_SIZE = 500

export function resolveImageUrl(imagePath: string): string {
  const cached = imageUrlCache.get(imagePath)
  if (cached) return cached

  const resolved = resolveImageUrlUncached(imagePath)

  if (imageUrlCache.size >= MAX_CACHE_SIZE) {
    const first = imageUrlCache.keys().next().value
    if (first !== undefined) imageUrlCache.delete(first)
  }
  imageUrlCache.set(imagePath, resolved)
  return resolved
}

function resolveImageUrlUncached(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bucketName = 'gallery-images'

  if (imagePath.includes('supabase.co')) {
    return imagePath
  }

  if (process.env.NODE_ENV === 'production' && supabaseUrl) {
    let cleanPath = imagePath
      .replace(/^\/images\/gallery\//, '')
      .replace(/^\/images\/audio\//, 'audio/')
      .replace(/^\/gallery\//, '')
      .replace(/^\//, '')

    return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${cleanPath}`
  }
  
  if (process.env.NODE_ENV === 'production' && !supabaseUrl) {
    console.warn('Supabase URL not configured in production. Images may not load correctly.')
  }

  return imagePath.startsWith('/') ? imagePath : `/${imagePath}`
}

/**
 * Get optimized image URL with transformations (if Supabase supports it)
 */
export function getOptimizedImageUrl(
  imagePath: string,
  options?: {
    width?: number
    height?: number
    quality?: number
    format?: 'webp' | 'avif' | 'jpg' | 'png'
  }
): string {
  const baseUrl = resolveImageUrl(imagePath)

  // Supabase Storage doesn't support image transformations by default
  // But we can use Next.js Image optimization with the Supabase URL
  // For now, return the base URL and let Next.js handle optimization
  return baseUrl
}


