'use client'

import TipJar from '@/components/shop/TipJar'
import Link from 'next/link'

export default function TipPage() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <nav className="mb-8">
          <Link href="/shop" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to Shop
          </Link>
        </nav>

        <TipJar />

        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            100% of tips go directly to SERGIK. No middlemen.
          </p>
        </div>
      </div>
    </div>
  )
}
