'use client'

import Link from 'next/link'
import { safeInternalPath } from '@/lib/safe-internal-path'

type FreeFanMembershipCalloutProps = {
  /** Safe internal path after magic-link signup (defaults to music library). */
  returnPath?: string | null
  className?: string
}

export default function FreeFanMembershipCallout({
  returnPath,
  className = '',
}: FreeFanMembershipCalloutProps) {
  const next = safeInternalPath(returnPath) || '/music-library'
  const registerHref = `/fan/register?next=${encodeURIComponent(next)}`

  return (
    <div
      className={`rounded-xl border border-emerald-600/40 bg-emerald-950/30 px-6 py-5 max-w-2xl mx-auto ${className}`}
    >
      <h3 className="text-lg font-semibold text-white mb-1">Free fan membership</h3>
      <p className="text-sm text-gray-300 mb-4">
        $0 account with email and password (needed for shop checkout and downloads). Magic link still works for the
        vault and playlists if you add a password before buying. Paid plans below are optional upgrades.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={registerHref}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
        >
          Create free fan account
        </Link>
        <Link
          href="/fan"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-emerald-500/50 text-emerald-200 text-sm font-medium hover:bg-emerald-950/50 transition-colors"
        >
          What you get
        </Link>
      </div>
    </div>
  )
}
