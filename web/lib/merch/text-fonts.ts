export type MerchFontCategory = 'brand' | 'display' | 'sans' | 'serif' | 'script' | 'mono'

export type MerchFont = {
  id: string
  label: string
  /** CSS family used for canvas and preview. */
  family: string
  stack: string
  weight: number
  category: MerchFontCategory
  source: 'local' | 'google' | 'system'
}

export const MERCH_FONT_CATEGORIES: Array<{ id: MerchFontCategory; label: string }> = [
  { id: 'brand', label: 'Brand' },
  { id: 'display', label: 'Display' },
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'script', label: 'Script' },
  { id: 'mono', label: 'Mono' },
]

function google(category: MerchFontCategory, family: string, weight: number, generic: string): MerchFont {
  return {
    id: family.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label: family,
    family,
    stack: `"${family}", ${generic}`,
    weight,
    category,
    source: 'google',
  }
}

/**
 * Faces we can ship. Picsart Pro fonts stay inside Picsart; they are not a
 * downloadable pack. These are the open-license equivalents (SIL OFL / Apache)
 * in the same merch categories: condensed display, sans, serif, script, mono.
 */
export const MERCH_FONTS: MerchFont[] = [
  { id: 'six-caps', label: 'Six Caps', family: 'Six Caps', stack: '"Six Caps", Impact, sans-serif', weight: 400, category: 'brand', source: 'local' },
  { id: 'impact', label: 'Impact', family: 'Impact', stack: 'Impact, "Arial Black", sans-serif', weight: 700, category: 'brand', source: 'system' },
  { id: 'sans', label: 'Sans', family: 'Helvetica', stack: 'Helvetica, Arial, sans-serif', weight: 700, category: 'brand', source: 'system' },
  { id: 'serif', label: 'Serif', family: 'Georgia', stack: 'Georgia, "Times New Roman", serif', weight: 700, category: 'brand', source: 'system' },
  { id: 'mono', label: 'Mono', family: 'Courier New', stack: '"Courier New", monospace', weight: 700, category: 'brand', source: 'system' },

  google('display', 'Bebas Neue', 400, 'Impact, sans-serif'),
  google('display', 'Anton', 400, 'Impact, sans-serif'),
  google('display', 'Oswald', 700, 'sans-serif'),
  google('display', 'Archivo Black', 400, 'Impact, sans-serif'),
  google('display', 'Barlow Condensed', 700, 'sans-serif'),
  google('display', 'Teko', 700, 'sans-serif'),
  google('display', 'Russo One', 400, 'sans-serif'),
  google('display', 'Staatliches', 400, 'Impact, sans-serif'),
  google('display', 'Passion One', 700, 'Impact, sans-serif'),
  google('display', 'Bowlby One', 400, 'Impact, sans-serif'),
  google('display', 'Alfa Slab One', 400, 'serif'),
  google('display', 'Abril Fatface', 400, 'serif'),
  google('display', 'Bungee', 400, 'sans-serif'),
  google('display', 'Black Ops One', 400, 'sans-serif'),
  google('display', 'Graduate', 400, 'serif'),
  google('display', 'Monoton', 400, 'sans-serif'),
  google('display', 'Orbitron', 700, 'sans-serif'),
  google('display', 'Audiowide', 400, 'sans-serif'),
  google('display', 'Righteous', 400, 'sans-serif'),
  google('display', 'Unbounded', 700, 'sans-serif'),
  google('display', 'Big Shoulders Display', 700, 'sans-serif'),
  google('display', 'Big Shoulders Stencil Display', 700, 'sans-serif'),
  google('display', 'Fjalla One', 400, 'sans-serif'),
  google('display', 'Saira Condensed', 700, 'sans-serif'),
  google('display', 'Lilita One', 400, 'sans-serif'),
  google('display', 'Titan One', 400, 'sans-serif'),
  google('display', 'Rowdies', 700, 'sans-serif'),
  google('display', 'New Rocker', 400, 'serif'),
  google('display', 'Pirata One', 400, 'serif'),
  google('display', 'Poiret One', 400, 'sans-serif'),

  google('sans', 'Montserrat', 700, 'sans-serif'),
  google('sans', 'Poppins', 700, 'sans-serif'),
  google('sans', 'Barlow', 700, 'sans-serif'),
  google('sans', 'Archivo', 700, 'sans-serif'),
  google('sans', 'Outfit', 700, 'sans-serif'),
  google('sans', 'Work Sans', 700, 'sans-serif'),
  google('sans', 'Nunito', 700, 'sans-serif'),
  google('sans', 'DM Sans', 700, 'sans-serif'),
  google('sans', 'Rajdhani', 700, 'sans-serif'),
  google('sans', 'Exo 2', 700, 'sans-serif'),
  google('sans', 'Syncopate', 700, 'sans-serif'),
  google('sans', 'Josefin Sans', 700, 'sans-serif'),

  google('serif', 'Playfair Display', 700, 'serif'),
  google('serif', 'Cinzel', 700, 'serif'),
  google('serif', 'Libre Baskerville', 700, 'serif'),
  google('serif', 'Fraunces', 700, 'serif'),
  google('serif', 'Cormorant Garamond', 700, 'serif'),
  google('serif', 'EB Garamond', 700, 'serif'),

  google('script', 'Pacifico', 400, 'cursive'),
  google('script', 'Lobster', 400, 'cursive'),
  google('script', 'Great Vibes', 400, 'cursive'),
  google('script', 'Satisfy', 400, 'cursive'),
  google('script', 'Yellowtail', 400, 'cursive'),
  google('script', 'Sacramento', 400, 'cursive'),
  google('script', 'Dancing Script', 700, 'cursive'),
  google('script', 'Caveat', 700, 'cursive'),
  google('script', 'Permanent Marker', 400, 'cursive'),
  google('script', 'Bangers', 400, 'cursive'),
  google('script', 'Rock Salt', 400, 'cursive'),
  google('script', 'Patrick Hand', 400, 'cursive'),

  google('mono', 'Space Mono', 700, 'monospace'),
  google('mono', 'Roboto Mono', 700, 'monospace'),
  google('mono', 'IBM Plex Mono', 700, 'monospace'),
  google('mono', 'Share Tech Mono', 400, 'monospace'),
  google('mono', 'Special Elite', 400, 'monospace'),
]

export function merchFontById(id: string): MerchFont {
  return MERCH_FONTS.find((font) => font.id === id) ?? MERCH_FONTS[0]
}

export function merchFontsIn(category: MerchFontCategory): MerchFont[] {
  return MERCH_FONTS.filter((font) => font.category === category)
}

/** Stylesheet for one Google face. Local and system faces need no request. */
export function merchFontStylesheet(font: MerchFont): string | null {
  if (font.source !== 'google') return null
  const family = encodeURIComponent(font.family)
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${font.weight}&display=swap`
}

const requested = new Set<string>()

export async function loadMerchFont(font: MerchFont, size = 28): Promise<void> {
  if (typeof document === 'undefined') return
  const href = merchFontStylesheet(font)
  if (href && !requested.has(href)) {
    requested.add(href)
    await new Promise<void>((resolve) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.dataset.merchFont = font.id
      link.onload = () => resolve()
      link.onerror = () => resolve()
      document.head.appendChild(link)
    })
  }
  if (!('fonts' in document)) return
  const family = font.family.includes(' ') ? `"${font.family}"` : font.family
  try {
    await document.fonts.load(`${font.weight} ${size}px ${family}`)
  } catch {
    /* paint with the fallback stack */
  }
}

export async function loadMerchFonts(fonts: MerchFont[]): Promise<void> {
  await Promise.all(fonts.map((font) => loadMerchFont(font)))
}
