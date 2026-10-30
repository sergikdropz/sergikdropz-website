'use client'

import { Suspense } from 'react'
import MerchCartView from '@/components/shop/MerchCartView'

export default function MerchCartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-4 pb-16 pt-20">
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="mx-auto h-10 w-32 animate-pulse rounded bg-gray-800" />
            <div className="h-24 animate-pulse rounded-lg bg-gray-800" />
          </div>
        </div>
      }
    >
      <MerchCartView />
    </Suspense>
  )
}
