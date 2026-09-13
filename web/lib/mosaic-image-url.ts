/** Build a `/_next/image` href for `<link rel="preload">` (matches next/image optimizer). */
export function nextImageOptimizerHref(src: string, width: number, quality: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`
}
