'use client'

import { useState } from 'react'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'

interface LicenseTier {
  id: string
  name: string
  price: number
  description: string
  popular?: boolean
  features: string[]
  deliverables: string[]
  terms: {
    streamLimit: number | null
    exclusivity: string
    duration: string
    allowCommercial: boolean
    allowPerformance: boolean
    allowRadio: boolean
    creditRequired: boolean
  }
}

interface LicenseTierSelectorProps {
  tiers: LicenseTier[]
  trackId: string
  trackTitle: string
  availableTiers?: string[]
}

export default function LicenseTierSelector({
  tiers,
  trackId,
  trackTitle,
  availableTiers,
}: LicenseTierSelectorProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filteredTiers = availableTiers?.length
    ? tiers.filter((t) => availableTiers.includes(t.id))
    : tiers

  const handleSelect = async (tier: LicenseTier) => {
    setLoading(tier.id)
    setError(null)

    try {
      const gate = await ensureShopCheckoutAuth({
        returnPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop',
      })
      if (!gate.ok) return
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackId,
          licenseTier: tier.id,
          productType: 'license',
          supabaseUserId: gate.userId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create checkout')
      }

      const { url } = await res.json()
      if (url) {
        window.location.href = url
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-4">Choose Your License</h3>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredTiers.map((tier) => (
          <div
            key={tier.id}
            className={`relative bg-gray-900/50 border rounded-lg p-5 flex flex-col transition-all hover:border-gray-500 ${
              tier.popular ? 'border-purple-500' : 'border-gray-800'
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </div>
            )}

            <h4 className="text-white font-bold text-lg">{tier.name}</h4>
            <p className="text-3xl font-bold text-white mt-2">{formatPrice(tier.price)}</p>
            <p className="text-gray-400 text-sm mt-2">{tier.description}</p>

            <ul className="mt-4 space-y-2 flex-1">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSelect(tier)}
              disabled={loading === tier.id}
              className={`mt-4 w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                tier.popular
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-white hover:bg-gray-200 text-black'
              }`}
            >
              {loading === tier.id ? 'Processing...' : `Buy ${tier.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
