import { describe, expect, it } from 'vitest'
import bundles from '@/data/bundles.json'
import products from '@/data/products.json'
import {
  normalizeShopAudioFormat,
  shopFormatPrices,
  shopReleasePrice,
  shopReleasePriceCents,
} from '@/lib/shop/format-prices'

describe('shop format prices', () => {
  it('charges $1.29 per MP3 track and $1.99 per lossless WAV track', () => {
    expect(shopReleasePrice(1, 'MP3')).toBe(1.29)
    expect(shopReleasePrice(1, 'WAV')).toBe(1.99)
    expect(shopReleasePrice(5, 'MP3')).toBe(6.45)
    expect(shopReleasePrice(5, 'WAV')).toBe(9.95)
    expect(shopReleasePrice(6, 'MP3')).toBe(7.74)
    expect(shopReleasePrice(6, 'WAV')).toBe(11.94)
    expect(shopReleasePriceCents(5, 'WAV')).toBe(995)
  })

  it('accepts only MP3 and WAV', () => {
    expect(normalizeShopAudioFormat('mp3')).toBe('MP3')
    expect(normalizeShopAudioFormat(' wav ')).toBe('WAV')
    expect(normalizeShopAudioFormat('FLAC')).toBeNull()
  })

  it('prices every shop EP from its track count', () => {
    for (const product of products.products) {
      const prices = shopFormatPrices(product.trackCount)
      expect(product.price).toBe(prices.MP3)
      expect(prices.WAV).toBeGreaterThan(prices.MP3)
    }
  })

  it('keeps the complete collection strike price equal to buying every EP as WAV', () => {
    const wavTotal = products.products.reduce(
      (sum, product) => sum + shopReleasePrice(product.trackCount, 'WAV'),
      0,
    )
    const collection = bundles.bundles.find((bundle) => bundle.id === 'bundle-all-eps')
    expect(collection?.originalPrice).toBe(Number(wavTotal.toFixed(2)))
  })
})
