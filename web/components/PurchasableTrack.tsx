'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import AudioPlayer from './AudioPlayer'
import { loadStripe } from '@stripe/stripe-js'
import { shouldUnoptimizeImage, isSafeNextImageSrc } from '@/utils/imageOptimization'
import { resolveImageUrl } from '@/utils/resolveImageUrl'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

interface PurchasableTrack {
  id: string
  title: string
  description: string
  price: number
  formats: Array<{
    type: string
    file: string
    size: string
  }>
  previewUrl: string
  artwork?: string
  duration?: number
}

export default function PurchasableTrack({ track }: { track: PurchasableTrack }) {
  const [selectedFormat, setSelectedFormat] = useState(track.formats[0].type)
  const [isLoading, setIsLoading] = useState(false)
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const cover = track.artwork ? resolveImageUrl(track.artwork) : ''

  // Check if returning from successful purchase
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const purchaseSuccess = params.get('purchase') === 'success'
      const sid = params.get('session_id')

      if (purchaseSuccess && sid) {
        setSessionId(sid)
        setPurchaseStatus('success')
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  const handlePurchase = async () => {
    setIsLoading(true)
    setPurchaseStatus('idle')

    try {
      const gate = await ensureShopCheckoutAuth({
        returnPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop',
      })
      if (!gate.ok) {
        setIsLoading(false)
        return
      }
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          trackId: track.id,
          format: selectedFormat,
          supabaseUserId: gate.userId,
        }),
      })

      const { sessionId, url, error } = await response.json()

      if (error) {
        throw new Error(error)
      }

      if (!stripePromise) {
        throw new Error('Stripe not configured')
      }

      const stripe = await stripePromise

      if (!stripe) {
        throw new Error('Stripe initialization failed')
      }

      // Redirect to Stripe Checkout
      const { error: redirectError } = await stripe.redirectToCheckout({
        sessionId,
      })

      if (redirectError) {
        throw new Error(redirectError.message)
      }
    } catch (error: any) {
      console.error('Purchase error:', error)
      setPurchaseStatus('error')
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!sessionId) return
    const downloadUrl = `/api/download?session_id=${sessionId}&track_id=${track.id}&format=${selectedFormat}`
    window.open(downloadUrl, '_blank')
  }

  // Show success state if purchase was successful
  if (purchaseStatus === 'success' && sessionId) {
    return (
      <div className="bg-gray-900 rounded-lg overflow-hidden p-6 border-2 border-green-500">
        <div className="text-center">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-2xl font-semibold mb-2">Purchase Successful!</h3>
          <p className="text-gray-400 mb-6">Your download is ready</p>
          <button
            onClick={handleDownload}
            className="px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors"
          >
            Download {track.title} ({selectedFormat})
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden p-6">
      <div className="flex flex-col md:flex-row gap-6">
        {isSafeNextImageSrc(cover) && (
          <div className="relative w-full md:w-32 h-32 flex-shrink-0">
            <Image
              src={cover}
              alt={track.title}
              fill
              className="object-cover rounded"
              unoptimized={shouldUnoptimizeImage(cover)}
              sizes="(max-width: 640px) 100vw, 128px"
            />
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-xl font-semibold mb-2">{track.title}</h3>
          <p className="text-gray-400 text-sm mb-4">{track.description}</p>
          
          {/* Preview Player */}
          <div className="mb-4">
            <AudioPlayer 
              src={track.previewUrl} 
              title={`${track.title} (Preview)`}
            />
          </div>

          {/* Format Selection */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Select Format:</p>
            <div className="flex gap-2 flex-wrap">
              {track.formats.map((format) => (
                <button
                  key={format.type}
                  onClick={() => setSelectedFormat(format.type)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    selectedFormat === format.type
                      ? 'bg-white text-black'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {format.type} ({format.size})
                </button>
              ))}
            </div>
          </div>

          {/* Purchase Section */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">${track.price.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {track.formats.find(f => f.type === selectedFormat)?.size}
              </p>
            </div>
            <button
              onClick={handlePurchase}
              disabled={isLoading}
              className="px-6 py-2 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Purchase'}
            </button>
          </div>

          {purchaseStatus === 'error' && (
            <p className="text-red-400 text-sm mt-2">
              Payment failed. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

