/**
 * Audio URL normalizer — ensures all audio file URLs use the Supabase Storage
 * CDN-friendly public endpoint instead of signed URLs or raw storage paths.
 *
 * Supabase Storage already routes /storage/v1/object/public/* through its CDN.
 * Signed URLs (/object/sign/*) are not cached by Cloudflare; public URLs are.
 *
 * Production caching setup (recommended):
 * 1. Put Cloudflare in front of your Supabase project URL.
 * 2. Add a page rule: supabase-url/storage/v1/* → Cache Everything, Edge TTL 1 month.
 * 3. Set NEXT_PUBLIC_AUDIO_CDN_PREFIX to your Cloudflare worker or R2 bucket URL if
 *    you want to serve audio from a custom domain (e.g. cdn.sergikdropz.com).
 *
 * Without Cloudflare, public Supabase URLs still benefit from regional caching.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const CUSTOM_CDN = process.env.NEXT_PUBLIC_AUDIO_CDN_PREFIX?.replace(/\/$/, '') ?? ''
const AUDIO_BUCKET = 'audio-files'

/**
 * Convert any Supabase Storage URL (signed or path) to a public CDN URL.
 * Returns the original URL unchanged if it cannot be normalized.
 */
export function toPublicAudioUrl(url: string | null | undefined): string | null {
  if (!url) return null

  // Already a public storage URL — optionally rewrite to custom CDN prefix
  if (url.includes('/storage/v1/object/public/')) {
    if (CUSTOM_CDN) return url.replace(`${SUPABASE_URL}/storage/v1/object/public`, CUSTOM_CDN)
    return url
  }

  // Signed URL — strip token and convert to public format
  if (url.includes('/storage/v1/object/sign/')) {
    const clean = url.split('?')[0]!
    const publicUrl = clean.replace('/storage/v1/object/sign/', '/storage/v1/object/public/')
    if (CUSTOM_CDN) return publicUrl.replace(`${SUPABASE_URL}/storage/v1/object/public`, CUSTOM_CDN)
    return publicUrl
  }

  // Bare path (e.g. "audio/my-track.wav") — build full public URL
  if (!url.startsWith('http')) {
    const path = url.replace(/^\/+/, '')
    const base = CUSTOM_CDN || `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}`
    return `${base}/${path}`
  }

  return url
}

/**
 * Build a Supabase Storage public URL from a storage path.
 * Path should not include the bucket name.
 */
export function buildAudioUrl(storagePath: string): string {
  const path = storagePath.replace(/^\/+/, '')
  if (CUSTOM_CDN) return `${CUSTOM_CDN}/${path}`
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`
}

/**
 * Returns true if the URL is a Supabase Storage signed URL (not CDN-cacheable).
 * Use this to warn when signed URLs leak into public contexts.
 */
export function isSignedStorageUrl(url: string | null | undefined): boolean {
  return !!url && url.includes('/storage/v1/object/sign/')
}
