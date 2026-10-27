'use client'

import Link from 'next/link'
import ShopDepartmentHub from '@/components/shop/ShopDepartmentHub'
import NavigationButtons from '@/components/NavigationButtons'

export default function ShopHubClient() {
  return (
    <div className="relative min-h-screen pt-20">
      <div className="container relative z-10 mx-auto px-4 py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-4xl text-center">
          <h1 className="font-six-caps mb-4 text-5xl font-bold tracking-[0.12em] text-white sm:text-6xl md:text-7xl">
            Shop
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            Choose a store — music downloads and membership live today; merch is in its own shop. Software and
            hardware stores are on the roadmap.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link
              href="/shop/music"
              className="rounded-lg bg-white px-4 py-2 font-semibold text-black transition hover:bg-gray-200"
            >
              Music Shop
            </Link>
            <Link
              href="/shop/merch"
              className="rounded-lg border border-gray-700 px-4 py-2 text-gray-200 transition hover:border-gray-500 hover:bg-gray-900/60"
            >
              Merch Shop
            </Link>
          </div>
        </div>

        <ShopDepartmentHub />

        <NavigationButtons />
      </div>
    </div>
  )
}
