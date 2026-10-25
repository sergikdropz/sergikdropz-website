/** Best-effort hex for Printful variant color names (preview swatches only). */
const NAMED: Record<string, string> = {
  black: '#1a1a1a',
  white: '#f3f3f3',
  navy: '#1c2740',
  'navy blue': '#1c2740',
  'sport grey': '#9a9a9a',
  'sport gray': '#9a9a9a',
  grey: '#9a9a9a',
  gray: '#9a9a9a',
  charcoal: '#36454f',
  bone: '#e4dccb',
  khaki: '#c2b280',
  red: '#b91c1c',
  maroon: '#6b1d2a',
  forest: '#1b4332',
  'forest green': '#1b4332',
  olive: '#556b2f',
  royal: '#4169e1',
  blue: '#2563eb',
  'light blue': '#93c5fd',
  pink: '#f472b6',
  purple: '#7c3aed',
  gold: '#ca8a04',
  orange: '#ea580c',
  brown: '#78350f',
  tan: '#d2b48c',
  natural: '#e8dcc8',
  cream: '#fffdd0',
  asphalt: '#4a4a4a',
  midnight: '#191970',
}

export function colorNameToHex(name: string): string {
  const trimmed = name.trim()
  const key = trimmed.toLowerCase()
  if (NAMED[key]) return NAMED[key]
  for (const [token, hex] of Object.entries(NAMED)) {
    if (key.includes(token)) return hex
  }
  let hash = 0
  for (let i = 0; i < trimmed.length; i += 1) hash = trimmed.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 42% 42%)`
}
