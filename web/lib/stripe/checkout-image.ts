/** Stripe rejects product image URLs that contain raw spaces. */

export function stripeCheckoutImageUrl(baseUrl: string, artwork?: string | null): string | null {
  const art = String(artwork || '').trim()
  if (!art) return null
  const base = String(baseUrl || '').replace(/\/$/, '')
  const absolute = /^https?:\/\//i.test(art) ? art : `${base}${art.startsWith('/') ? '' : '/'}${art}`
  try {
    const url = new URL(absolute)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const pathname = url.pathname
      .split('/')
      .map((segment) => {
        if (!segment) return ''
        try {
          return encodeURIComponent(decodeURIComponent(segment))
        } catch {
          return encodeURIComponent(segment)
        }
      })
      .join('/')
    return `${url.origin}${pathname}${url.search}`
  } catch {
    return null
  }
}

export function stripeCheckoutImages(baseUrl: string, artwork?: string | null): string[] {
  const image = stripeCheckoutImageUrl(baseUrl, artwork)
  return image ? [image] : []
}
