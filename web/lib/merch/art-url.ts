const ART_FILE = /^[0-9a-f-]{36}\.(png|jpg)$/i

/** Library file name from a public storage URL or `/api/merch/art/:id`. */
export function merchArtIdFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0]
  const name = path.split('/').pop() || ''
  return ART_FILE.test(name) ? name : null
}

/** Same library file, ignoring a cache-busting query. */
export function sameMerchArt(a: string, b: string): boolean {
  const aId = merchArtIdFromUrl(a)
  const bId = merchArtIdFromUrl(b)
  if (aId && bId) return aId.toLowerCase() === bId.toLowerCase()
  return a.split(/[?#]/)[0] === b.split(/[?#]/)[0]
}

export function withArtVersion(url: string, version: number | string): string {
  const base = url.split(/[?#]/)[0]
  return `${base}?v=${encodeURIComponent(String(version))}`
}
