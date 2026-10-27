'use client'

import { useEffect, useState } from 'react'
import ProductCard from '@/components/shop/ProductCard'
import BuyButton from '@/components/BuyButton'
import type { MemberCatalogItem } from '@/lib/shop/member-catalog'

type Props = {
  items: MemberCatalogItem[]
}

export default function ShopExclusiveSection({ items }: Props) {
  const [planId, setPlanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/shop/entitlements', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPlanId(data?.planId ?? null))
      .finally(() => setLoading(false))
  }, [])

  if (!items.length) return null

  const innerCircle = planId === 'inner-circle'
  const supporterTeaser = planId === 'supporter'

  return (
    <section id="exclusive" className="mt-16 scroll-mt-28">
      <h2 className="text-2xl font-bold text-white">Exclusive releases</h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-400">
        Unreleased and pre-release projects. Inner Circle can preview and purchase with card or shop credits. Supporters
        see a teaser only.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="relative">
            <div className={supporterTeaser || (!innerCircle && !loading) ? 'pointer-events-none select-none blur-sm' : ''}>
              <ProductCard
                id={item.id}
                title={item.title}
                slug={item.slug}
                description={item.note || item.description}
                price={item.price}
                artwork={item.artwork}
                formatPrices={item.formatPrices}
                href={innerCircle ? `/shop/${item.slug}` : undefined}
              />
            </div>
            {innerCircle ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <BuyButton
                  title={item.title}
                  price={item.formatPrices.MP3}
                  checkout_method="stripe"
                  productId={item.productId}
                  productType="ep-bundle"
                  stripe_format="MP3"
                  compact
                />
                <BuyButton
                  title={item.title}
                  price={item.formatPrices.WAV}
                  checkout_method="stripe"
                  productId={item.productId}
                  productType="ep-bundle"
                  stripe_format="WAV"
                  compact
                />
              </div>
            ) : null}
            {supporterTeaser ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4 text-center">
                <p className="text-sm font-medium text-white">Upgrade to Inner Circle to unlock purchases</p>
              </div>
            ) : null}
            {!loading && !planId ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 text-center">
                <p className="text-sm text-gray-200">Sign in with membership to view exclusives</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
