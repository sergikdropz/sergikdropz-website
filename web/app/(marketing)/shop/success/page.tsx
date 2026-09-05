'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { safeInternalPath } from '@/lib/safe-internal-path'

export default function PurchaseSuccessPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const method = searchParams.get('method')
  const type = searchParams.get('type')
  const tier = searchParams.get('tier')
  const continuePath = safeInternalPath(searchParams.get('next'))
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId && method !== 'gumroad') {
      verifyPurchase(sessionId)
    }
  }, [sessionId, method])

  async function verifyPurchase(sid: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchases/verify?session_id=${sid}`)
      if (res.ok) {
        const data = await res.json()
        if (data.downloadUrl) {
          setDownloadUrl(data.downloadUrl)
        }
      } else {
        setError('Could not verify purchase. Please contact support.')
      }
    } catch {
      setError('Could not verify purchase. Please contact support.')
    } finally {
      setLoading(false)
    }
  }

  const isGumroad = method === 'gumroad'
  const isLicense = type === 'license'
  const isTip = type === 'tip'
  const isSubscription = type === 'subscription'
  const isMerch = type === 'merch'

  const tierLabels: Record<string, string> = {
    lease: 'Lease License',
    premium: 'Premium Lease License',
    stems: 'Stems Package',
    exclusive: 'Exclusive License',
  }

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Success icon */}
        <div className="w-20 h-20 mx-auto bg-green-600/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white">Thank You!</h1>

        {/* Type-specific messaging */}
        {isLicense && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-3">
            <p className="text-gray-300 text-lg">License purchased successfully!</p>
            {tier && (
              <p className="text-purple-400 font-semibold">
                {tierLabels[tier] || tier}
              </p>
            )}
            <p className="text-gray-400 text-sm">
              Your license agreement and download files have been sent to your email.
              You can start using this beat immediately.
            </p>
          </div>
        )}

        {isTip && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <p className="text-gray-300 text-lg">Your support means everything!</p>
            <p className="text-gray-400 text-sm mt-2">
              Every tip goes directly towards creating more music. Thank you for believing in the vision.
            </p>
          </div>
        )}

        {isSubscription && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-3">
            <p className="text-gray-300 text-lg">Welcome to the family!</p>
            <p className="text-gray-400 text-sm">
              Your membership is now active. You can manage your subscription anytime from your member dashboard.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              {continuePath && (
                <Link
                  href={continuePath}
                  className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-all"
                >
                  Continue
                </Link>
              )}
              <Link
                href="/shop/membership/manage"
                className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-all"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {isMerch && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-3">
            <p className="text-gray-300 text-lg">Order confirmed!</p>
            <p className="text-gray-400 text-sm">
              Your merch order is being processed. You&#39;ll receive a confirmation email with tracking info once it ships.
            </p>
          </div>
        )}

        {/* Standard track / EP download */}
        {!isLicense && !isTip && !isSubscription && !isMerch && !isGumroad && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-4">
            <p className="text-gray-400 text-lg">Your purchase was successful.</p>
            {loading ? (
              <p className="text-gray-400 animate-pulse">Verifying your purchase...</p>
            ) : downloadUrl ? (
              <>
                <p className="text-gray-300 text-sm">Your download is ready:</p>
                <a
                  href={downloadUrl}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
                  download
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download
                </a>
                <p className="text-gray-500 text-xs">
                  A download link has also been sent to your email.
                </p>
              </>
            ) : error ? (
              <p className="text-red-400 text-sm">{error}</p>
            ) : (
              <p className="text-gray-400 text-sm">
                A download link has been sent to your email.
              </p>
            )}
          </div>
        )}

        {/* Gumroad message */}
        {isGumroad && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <p className="text-gray-300 text-sm">
              Check your email for the download link from Gumroad. If you don&apos;t see it within a few minutes, check your spam folder.
            </p>
          </div>
        )}

        {/* Share prompt */}
        <div className="pt-4 space-y-3">
          <p className="text-gray-500 text-sm">Spread the word:</p>
          <div className="flex items-center justify-center gap-3">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Just grabbed some fire from @sergikdropz! Check out sergikdropz.com')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-all"
            >
              Share on X
            </a>
            <a
              href="https://instagram.com/sergikdropz"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-all"
            >
              Follow on IG
            </a>
          </div>
        </div>

        {/* Navigation */}
        <div className="pt-6 flex items-center justify-center gap-4">
          <Link
            href="/shop"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Back to Shop
          </Link>
          <span className="text-gray-700">|</span>
          <Link
            href="/music"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Browse Music
          </Link>
          <span className="text-gray-700">|</span>
          <Link
            href="/"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
