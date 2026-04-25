'use client'

import { useState } from 'react'
import { openGumroadCheckout } from '@/lib/gumroad'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'

interface BuyButtonProps {
  title: string
  price: number
  checkout_method: 'gumroad' | 'stripe'
  gumroad_product_id?: string
  stripe_track_id?: string
  stripe_format?: string
  /** License tier ID for beat licensing */
  licenseTier?: string
  /** Product ID for EP bundles / products */
  productId?: string
  /** Product type: track, ep-bundle, license, bundle, tip, merch */
  productType?: string
  className?: string
  compact?: boolean
}

export default function BuyButton({
  title,
  price,
  checkout_method,
  gumroad_product_id,
  stripe_track_id,
  stripe_format,
  licenseTier,
  productId,
  productType,
  className,
  compact = false,
}: BuyButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)

    try {
      if (checkout_method === 'gumroad') {
        if (!gumroad_product_id) {
          throw new Error('Missing Gumroad product ID')
        }
        await openGumroadCheckout(gumroad_product_id)
        } else {
        // Stripe checkout
        const body: Record<string, string> = {}

        if (licenseTier && stripe_track_id) {
          body.trackId = stripe_track_id
          body.licenseTier = licenseTier
          body.productType = 'license'
        } else if (productType === 'ep-bundle' && productId) {
          body.productId = productId
          body.productType = 'ep-bundle'
        } else {
          if (!stripe_track_id || !stripe_format) {
            throw new Error('Missing track ID or format for Stripe checkout')
          }
          body.trackId = stripe_track_id
          body.format = stripe_format
          if (productType) body.productType = productType
        }

        const gate = await ensureShopCheckoutAuth({
          returnPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop',
        })
        if (!gate.ok) return
        body.supabaseUserId = gate.userId

        const res = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create checkout session')
        }

        const { url } = await res.json()
        if (url) {
          window.location.href = url
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={
          className ||
          'px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white text-xs font-semibold rounded transition-all inline-flex items-center gap-1.5'
        }
        title={`Buy ${title} for ${formattedPrice}`}
      >
        {loading ? (
          <span className="animate-pulse">...</span>
        ) : (
          <span>{formattedPrice}</span>
        )}
      </button>
    )
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={
          className ||
          'px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all inline-flex items-center gap-2 min-h-[44px] touch-manipulation'
        }
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Processing...</span>
          </>
        ) : (
          <>
            <span>Buy</span>
            <span className="font-bold">{formattedPrice}</span>
          </>
        )}
      </button>
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}
    </div>
  )
}
