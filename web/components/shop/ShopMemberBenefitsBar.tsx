'use client'

import { useEffect, useState } from 'react'

type Benefits = {
  tier: string
  shopCreditBalanceCents: number
  quota: {
    mp3Remaining: number
    wavRemaining: number
    mp3Limit: number
    wavLimit: number
  } | null
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export default function ShopMemberBenefitsBar() {
  const [benefits, setBenefits] = useState<Benefits | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/shop/entitlements', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setBenefits(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!benefits || benefits.tier === 'free') return null

  return (
    <div className="mb-8 rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-3 text-sm text-purple-100">
      <p className="font-semibold text-white">Member benefits this period</p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-purple-100/90">
        <span>Shop credits: {money(benefits.shopCreditBalanceCents)}</span>
        {benefits.quota ? (
          <>
            <span>
              MP3 picks left: {benefits.quota.mp3Remaining}/{benefits.quota.mp3Limit}
            </span>
            <span>
              WAV picks left: {benefits.quota.wavRemaining}/{benefits.quota.wavLimit}
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-purple-200/70">
        Credits apply to digital releases only (12-month expiry). Exclusives are card or credits — not monthly picks.
      </p>
    </div>
  )
}
