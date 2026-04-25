'use client'

import { useEffect, useState, ReactNode } from 'react'
import Link from 'next/link'

interface MemberContentProps {
  /**
   * Email to check membership for. If omitted, uses the signed-in fan session (same-origin cookies).
   */
  email?: string
  /** Minimum plan required (e.g., 'supporter' or 'inner-circle') */
  requiredPlan?: string
  /** Content to show to members */
  children: ReactNode
  /** Message for non-members */
  fallbackMessage?: string
}

export default function MemberContent({
  email,
  requiredPlan,
  children,
  fallbackMessage = 'This content is exclusive to members.',
}: MemberContentProps) {
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      try {
        const url = email
          ? `/api/membership/status?email=${encodeURIComponent(email)}`
          : '/api/membership/status'
        const init: RequestInit = email ? {} : { credentials: 'include' }
        const res = await fetch(url, init)
        if (res.ok) {
          const data = await res.json()
          if (data.active) {
            if (requiredPlan === 'inner-circle' && data.membership.planId !== 'inner-circle') {
              setHasAccess(false)
            } else {
              setHasAccess(true)
            }
          } else {
            setHasAccess(false)
          }
        } else {
          setHasAccess(false)
        }
      } catch (err) {
        console.error('Membership check error:', err)
        setHasAccess(false)
      } finally {
        setLoading(false)
      }
    }
    setLoading(true)
    check()
  }, [email, requiredPlan])

  if (loading) {
    return <div className="animate-pulse bg-gray-800 rounded-lg h-32" />
  }

  if (!hasAccess) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <p className="text-gray-400">{fallbackMessage}</p>
        <Link
          href="/shop/membership"
          className="inline-block mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-all"
        >
          Become a Member
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
