/** DistroKid-style promo card pack: pick a design, download, post. */

export const PROMO_CARD_LAYOUTS = [
  { id: 'bleed', label: 'Full bleed' },
  { id: 'frame', label: 'Centered' },
  { id: 'light', label: 'Light' },
  { id: 'poster', label: 'Poster' },
  { id: 'band', label: 'Color band' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'ticket', label: 'Ticket' },
] as const

export type PromoCardLayoutId = (typeof PROMO_CARD_LAYOUTS)[number]['id']

export const PROMO_CARD_FORMATS = ['square', 'story'] as const
export type PromoCardFormat = (typeof PROMO_CARD_FORMATS)[number]

export const PROMO_CARD_MODES = ['presave', 'outnow'] as const
export type PromoCardMode = (typeof PROMO_CARD_MODES)[number] | 'coming'

export type PromoCardCopy = {
  badge: string
  cta: string
}

/** Main DSPs shown under “Available on”, then the site host. */
export const PROMO_CARD_SERVICES = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'apple_music', label: 'Apple Music' },
  { id: 'youtube_music', label: 'YouTube Music' },
  { id: 'amazon', label: 'Amazon Music' },
  { id: 'tidal', label: 'Tidal' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'soundcloud', label: 'SoundCloud' },
] as const

export type PromoCardServiceId = (typeof PROMO_CARD_SERVICES)[number]['id']

export const PROMO_CARD_AVAILABLE_LABEL = 'Available on'
export const PROMO_CARD_SITE_HOST = 'sergikdropz.com'

const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

const COMING_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Oct 30` from `YYYY-MM-DD`. Empty when the date is missing. */
export function promoComingDateLabel(value?: string | null): string {
  const raw = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const [, monthRaw, dayRaw] = raw.split('-')
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${COMING_MONTHS[month - 1]} ${day}`
}

export function promoComingBadge(value?: string | null): string {
  const date = promoComingDateLabel(value)
  return date ? `COMING SOON · ${date.toUpperCase()}` : 'COMING SOON'
}

export function promoCardCopy(mode: PromoCardMode, comingDate?: string | null): PromoCardCopy {
  if (mode === 'presave') return { badge: 'PRE-SAVE', cta: 'Link in bio' }
  if (mode === 'coming') return { badge: promoComingBadge(comingDate), cta: 'Coming soon' }
  return { badge: 'OUT NOW', cta: 'Listen now' }
}

export function promoCardModeLabel(mode: PromoCardMode): string {
  if (mode === 'presave') return 'Pre-save'
  if (mode === 'coming') return 'Coming soon'
  return 'Out now'
}

export function promoCardFormatLabel(format: PromoCardFormat): string {
  return format === 'story' ? 'Story' : 'Square'
}

/** Future street dates open on pre-save; today and earlier open on out now. */
export function defaultPromoCardMode(
  streetDate: string | null | undefined,
  now: Date = new Date()
): PromoCardMode {
  const raw = (streetDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'outnow'
  const [year, month, day] = raw.split('-').map(Number)
  const street = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return street.getTime() > today.getTime() ? 'presave' : 'outnow'
}

export function promoCardPixelSize(format: PromoCardFormat, width: number): { width: number; height: number } {
  const safe = Math.max(64, Math.round(width))
  if (format === 'story') return { width: safe, height: Math.round((safe * 16) / 9) }
  return { width: safe, height: safe }
}

export function promoCardFilename(title: string, layoutId: string, format: PromoCardFormat): string {
  const slug =
    title
      .trim()
      .replace(/[^\w\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'release'
  return `${slug}-${layoutId}-${format}.png`
}

export { FONT as PROMO_CARD_FONT }
