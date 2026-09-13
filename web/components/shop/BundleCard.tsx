'use client'

import { useState } from 'react'

interface BundleCardProps {
  bundle: {
    id: string
    name: string
    description: string
    productIds: string[]
    originalPrice: number
    bundlePrice: number
    savingsPercent: number
    artwork?: string
  }
}

export default function BundleCard({ bundle }: BundleCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBuy = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/stripe/create-bundle-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId: bundle.id }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create checkout')
      }

      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 relative overflow-hidden">
      {/* Savings badge */}
      <div className="absolute top-3 right-3 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
        Save {bundle.savingsPercent}%
      </div>

      <h3 className="text-white font-bold text-lg pr-20">{bundle.name}</h3>
      <p className="text-gray-400 text-sm mt-1">{bundle.description}</p>

      {bundle.productIds.length > 0 && (
        <p className="text-gray-500 text-xs mt-2">
          Includes {bundle.productIds.length} items
        </p>
      )}

      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-2xl font-bold text-white">{formatPrice(bundle.bundlePrice)}</span>
        <span className="text-gray-500 line-through text-sm">{formatPrice(bundle.originalPrice)}</span>
      </div>

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

      <button
        onClick={handleBuy}
        disabled={loading}
        className="mt-4 w-full py-3 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:cursor-not-allowed text-black font-semibold rounded-lg text-sm transition-all"
      >
        {loading ? 'Processing...' : 'Get Bundle'}
      </button>
    </div>
  )
}
