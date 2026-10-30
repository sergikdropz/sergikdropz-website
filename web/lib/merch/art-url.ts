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

/** Library file names referenced by a list of art or mockup URLs. */
export function merchArtIdsFromUrls(urls: string[]): string[] {
  const ids: string[] = []
  for (const url of urls) {
    const id = merchArtIdFromUrl(url)
    if (id) ids.push(id.toLowerCase())
  }
  return ids
}

export type DesignArtRefs = {
  id: string
  mockupUrls?: string[]
  mockupUrlsByColor?: Record<string, string[]> | null
  mockupPendingByColor?: Record<string, string[]> | null
  placements?: Array<{ assetUrl?: string | null }>
  printFileUrls?: Record<string, string> | null
}

/** Artwork, baked print files, and Printful photos this product points at. */
export function referencedArtIds(design: DesignArtRefs): string[] {
  const urls = [
    ...(design.mockupUrls || []),
    ...Object.values(design.mockupUrlsByColor || {}).flat(),
    ...Object.values(design.mockupPendingByColor || {}).flat(),
    ...(design.placements || []).map((placement) => placement.assetUrl || ''),
    ...Object.values(design.printFileUrls || {}),
  ]
  return [...new Set(merchArtIdsFromUrls(urls))]
}

/** Files that go away with this product. A file another product still uses stays. */
export function artIdsOnlyUsedBy(design: DesignArtRefs, all: DesignArtRefs[]): string[] {
  const mine = new Set(referencedArtIds(design))
  for (const other of all) {
    if (other.id === design.id) continue
    for (const id of referencedArtIds(other)) mine.delete(id)
  }
  return [...mine]
}
