'use client'

import { useState } from 'react'
import { ensureShopCheckoutAuth } from '@/lib/checkoutActor'

interface Plan {
  id: string
  name: string
  price: number
  interval: string
  stripePriceId: string
  description: string
  features: string[]
  color: string
  popular?: boolean
}

interface MembershipPlansProps {
  plans: Plan[]
  /** Safe internal path (e.g. /music-library) to return after checkout */
  returnPath?: string | null
}

export default function MembershipPlans({ plans, returnPath }: MembershipPlansProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async (plan: Plan) => {
    if (!plan.stripePriceId) {
      setError('Subscriptions are being set up. Check back soon!')
      return
    }

    setLoading(plan.id)
    setError(null)

    try {
      const gate = await ensureShopCheckoutAuth({
        returnPath:
          returnPath ||
          (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop/membership'),
      })
      if (!gate.ok) return
      const res = await fetch('/api/stripe/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId: plan.id,
          supabaseUserId: gate.userId,
          ...(returnPath ? { returnPath } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start subscription')
      }

      const { url } = await res.json()
      if (url) window.location.href = url
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
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white">Paid fan plans</h2>
        <p className="text-gray-400 mt-2 max-w-lg mx-auto">
          Optional upgrades on top of free fan membership—exclusive access, early releases, and more.
        </p>
      </div>

      {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {plans.map((plan) => {
          const borderColor = plan.popular ? 'border-yellow-500' : 'border-purple-500'
          const buttonBg = plan.popular
            ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
            : 'bg-purple-600 hover:bg-purple-700 text-white'

          return (
            <div
              key={plan.id}
              className={`relative bg-gray-900/50 border ${borderColor} rounded-lg p-6 flex flex-col`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                  Best Value
                </div>
              )}

              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-white">{formatPrice(plan.price)}</span>
                <span className="text-gray-400 text-sm">/{plan.interval}</span>
              </div>
              <p className="text-gray-400 text-sm mt-2">{plan.description}</p>

              <ul className="mt-4 space-y-2 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan)}
                disabled={loading === plan.id}
                className={`mt-6 w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${buttonBg}`}
              >
                {loading === plan.id ? 'Processing...' : `Subscribe — ${formatPrice(plan.price)}/mo`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-gray-500 text-xs text-center mt-6">
        Cancel anytime. No commitment required.
      </p>
    </div>
  )
}
