/**
 * Gumroad checkout integration library
 * Handles overlay script loading, checkout URL generation, and product status
 */

const GUMROAD_OVERLAY_SCRIPT = 'https://gumroad.com/js/gumroad.js'

let scriptLoaded = false
let scriptLoading = false

/**
 * Load the Gumroad overlay script into the page
 * Safe to call multiple times — only loads once
 */
export function loadGumroadOverlay(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (typeof window === 'undefined') return Promise.resolve()

  if (scriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(check)
          resolve()
        }
      }, 100)
    })
  }

  scriptLoading = true

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GUMROAD_OVERLAY_SCRIPT}"]`)
    if (existing) {
      scriptLoaded = true
      scriptLoading = false
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = GUMROAD_OVERLAY_SCRIPT
    script.async = true
    script.onload = () => {
      scriptLoaded = true
      scriptLoading = false
      resolve()
    }
    script.onerror = () => {
      scriptLoading = false
      reject(new Error('Failed to load Gumroad overlay script'))
    }
    document.head.appendChild(script)
  })
}

/**
 * Generate a Gumroad checkout URL with overlay support
 * @param productId - The Gumroad product short ID (e.g., "sergikl-splitz")
 * @param options - Optional checkout parameters
 */
export function getGumroadCheckoutUrl(
  productId: string,
  options?: {
    wanted?: boolean
    email?: string
    variant?: string
  }
): string {
  const base = `https://sergikdropz.gumroad.com/l/${productId}`
  const params = new URLSearchParams()

  if (options?.wanted !== false) {
    params.set('wanted', 'true')
  }
  if (options?.email) {
    params.set('email', options.email)
  }
  if (options?.variant) {
    params.set('variant', options.variant)
  }

  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * Open Gumroad checkout overlay for a product
 * Falls back to redirect if overlay script fails to load
 */
export async function openGumroadCheckout(
  productId: string,
  options?: { email?: string; variant?: string }
): Promise<void> {
  const url = getGumroadCheckoutUrl(productId, { wanted: true, ...options })

  try {
    await loadGumroadOverlay()
    // Gumroad's overlay script auto-intercepts links with class "gumroad-button"
    // but we can also trigger it programmatically
    window.open(url, '_blank')
  } catch {
    // Fallback: redirect directly
    window.location.href = url
  }
}

export type ProductStatus = 'published' | 'draft' | 'unknown'

/**
 * Check if a Gumroad product is published (accessible)
 * Note: This is a simple fetch check — Gumroad doesn't have a public API for draft status
 */
export async function checkProductStatus(productId: string): Promise<ProductStatus> {
  try {
    const res = await fetch(
      `https://sergikdropz.gumroad.com/l/${productId}`,
      { method: 'HEAD', mode: 'no-cors' }
    )
    // no-cors means we can't read the status, but if it doesn't throw, it's likely published
    return 'published'
  } catch {
    return 'unknown'
  }
}
