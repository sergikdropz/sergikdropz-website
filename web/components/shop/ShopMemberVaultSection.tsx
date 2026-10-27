'use client'

import { useState } from 'react'
import ProductCard from '@/components/shop/ProductCard'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'
import type { MemberCatalogItem } from '@/lib/shop/member-catalog'

type Props = {
  items: MemberCatalogItem[]
}

export default function ShopMemberVaultSection({ items }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!items.length) return null

  async function redeem(productId: string, format: 'MP3' | 'WAV') {
    setError(null)
    setBusyId(`${productId}-${format}`)
    try {
      const gate = await ensureShopCheckoutAuth({ returnPath: '/shop#member-vault' })
      if (!gate.ok) return

      const res = await fetch('/api/shop/member-download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, format }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Download failed')
      if (data.downloadPath) window.location.href = data.downloadPath
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section id="member-vault" className="mt-16 scroll-mt-28">
      <h2 className="text-2xl font-bold text-white">Member vault picks</h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-400">
        Supporter and Inner Circle: use your monthly MP3 and WAV allowances on these catalog favorites (not exclusives).
      </p>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="space-y-3">
            <ProductCard
              id={item.id}
              title={item.title}
              slug={item.slug}
              description={item.note || item.description}
              price={item.price}
              artwork={item.artwork}
              formatPrices={item.formatPrices}
            />
            <div className="flex flex-wrap gap-2 px-1">
              {(['MP3', 'WAV'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={busyId === `${item.productId}-${format}`}
                  onClick={() => redeem(item.productId, format)}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {busyId === `${item.productId}-${format}` ? '…' : `Use 1 ${format} pick`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
