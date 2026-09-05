'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import MembershipPlans from '@/components/shop/MembershipPlans'
import FreeFanMembershipCallout from '@/components/shop/FreeFanMembershipCallout'
import { safeInternalPath } from '@/lib/safe-internal-path'

export default function MembershipPage() {
  const searchParams = useSearchParams()
  const returnPath = safeInternalPath(searchParams.get('next'))
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/shop/membership-plans')
        if (res.ok) {
          const data = await res.json()
          setPlans(data.plans || [])
        }
      } catch (err) {
        console.error('Error loading plans:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
        </nav>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-800 rounded mx-auto" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-800 rounded-lg h-80" />
              <div className="bg-gray-800 rounded-lg h-80" />
            </div>
          </div>
        ) : (
          <>
            <FreeFanMembershipCallout returnPath={returnPath} className="mb-10" />
            <MembershipPlans plans={plans} returnPath={returnPath} />
          </>
        )}

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto space-y-6">
          <h3 className="text-xl font-bold text-white text-center">Frequently Asked</h3>
          {[
            {
              q: 'Can I cancel anytime?',
              a: 'Yes. Cancel anytime from your member dashboard. You keep access until the end of your billing period.',
            },
            {
              q: 'What payment methods do you accept?',
              a: 'All major credit cards via Stripe. Your payment info is never stored on our servers.',
            },
            {
              q: 'Can I switch plans?',
              a: 'Yes. You can upgrade or downgrade from your member dashboard at any time.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <h4 className="text-white font-semibold text-sm">{q}</h4>
              <p className="text-gray-400 text-sm mt-1">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
