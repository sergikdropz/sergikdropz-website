/** Direct-download rates. MP3 matches the DistroKid $1.29 song tier; WAV is the lossless rate. */

export const SHOP_MP3_CENTS_PER_TRACK = 129
export const SHOP_WAV_CENTS_PER_TRACK = 199

export type ShopAudioFormat = 'MP3' | 'WAV'

export type ShopFormatPrices = {
  MP3: number
  WAV: number
}

export function normalizeShopAudioFormat(value: unknown): ShopAudioFormat | null {
  const key = String(value || '')
    .trim()
    .toUpperCase()
  if (key === 'MP3') return 'MP3'
  if (key === 'WAV') return 'WAV'
  return null
}

export function shopFormatCentsPerTrack(format: ShopAudioFormat): number {
  return format === 'WAV' ? SHOP_WAV_CENTS_PER_TRACK : SHOP_MP3_CENTS_PER_TRACK
}

export function shopReleasePriceCents(trackCount: number, format: ShopAudioFormat): number {
  const tracks = Math.floor(Number(trackCount))
  if (!Number.isFinite(tracks) || tracks < 1) {
    throw new Error('Track count is required to price this release')
  }
  return tracks * shopFormatCentsPerTrack(format)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

export function shopReleasePrice(trackCount: number, format: ShopAudioFormat): number {
  return centsToDollars(shopReleasePriceCents(trackCount, format))
}

export function shopFormatPrices(trackCount: number): ShopFormatPrices {
  return {
    MP3: shopReleasePrice(trackCount, 'MP3'),
    WAV: shopReleasePrice(trackCount, 'WAV'),
  }
}
