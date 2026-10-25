import { describe, expect, it } from 'vitest'
import {
  formatSaleAmount,
  shopBuyerDownloadNotice,
  shopOrderDownloadUrl,
  shopSaleNotice,
  shopSaleTitle,
} from '@/lib/email/shop-sale-notice'

describe('shop sale notices', () => {
  it('names an EP from the catalog and prices it in dollars', () => {
    expect(
      shopSaleTitle({
        productType: 'ep-bundle',
        metadata: { productId: 'ep-staying-a-vibe', format: 'MP3' },
      }),
    ).toBe('Staying A Vibe EP (Digital Download)')
    expect(formatSaleAmount(645, 'usd')).toBe('$6.45')
  })

  it('writes a shop mailbox note with the buyer and format', () => {
    const notice = shopSaleNotice({
      sessionId: 'cs_test_123',
      amountCents: 995,
      currency: 'usd',
      productType: 'ep-bundle',
      title: 'Staying A Vibe EP (Digital Download)',
      format: 'WAV',
      customerName: 'Ada',
      customerEmail: 'ada@example.com',
      downloadUrl: 'https://sergikdropz.com/api/download/order?session_id=cs_test_123',
    })
    expect(notice.subject).toBe('Sale: Staying A Vibe EP (Digital Download) — $9.95')
    expect(notice.body).toContain('Format: WAV')
    expect(notice.body).toContain('Buyer: Ada <ada@example.com>')
    expect(notice.body).toContain('Stripe: cs_test_123')
    expect(notice.body).toContain('Download: https://sergikdropz.com/api/download/order?session_id=cs_test_123')
  })

  it('builds a buyer download link for digital orders only', () => {
    const downloadUrl = shopOrderDownloadUrl({
      origin: 'https://sergikdropz.com/',
      sessionId: 'cs_test_123',
      productType: 'ep-bundle',
    })
    expect(downloadUrl).toBe('https://sergikdropz.com/api/download/order?session_id=cs_test_123')
    expect(
      shopOrderDownloadUrl({
        origin: 'https://sergikdropz.com',
        sessionId: 'cs_test_123',
        productType: 'tip',
      }),
    ).toBeNull()
    expect(shopBuyerDownloadNotice({ title: 'Inspire EP', format: 'MP3', downloadUrl: downloadUrl! }).body).toContain(
      downloadUrl!,
    )
  })

  it('labels tips, merch, and memberships without a catalog id', () => {
    expect(shopSaleTitle({ productType: 'tip' })).toBe('Tip')
    expect(shopSaleTitle({ productType: 'merch' })).toBe('Merch order')
    expect(shopSaleTitle({ productType: 'subscription' })).toBe('Membership')
  })
})
