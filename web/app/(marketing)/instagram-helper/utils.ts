export function isValidInstagramUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || url.trim() === '') return false
  return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')
}

/** Stable key for preview refetch — only changes when valid URLs or order changes */
export function previewFingerprint(posts: string[]): string {
  return posts.filter(isValidInstagramUrl).join('\u0001')
}
