'use client'

import Link from 'next/link'

type Subshop = 'hub' | 'music' | 'merch'

const LINKS: { id: Subshop; label: string; href: string }[] = [
  { id: 'hub', label: 'All shops', href: '/shop' },
  { id: 'music', label: 'Music', href: '/shop/music' },
  { id: 'merch', label: 'Merch', href: '/shop/merch' },
]

type Props = {
  active: Subshop
}

export default function ShopSubshopNav({ active }: Props) {
  return (
    <nav aria-label="Shop departments" className="mb-8 flex flex-wrap items-center justify-center gap-2 text-sm">
      {LINKS.map((link) => {
        const isActive = link.id === active
        return (
          <Link
            key={link.id}
            href={link.href}
            className={`rounded-full px-4 py-2 font-medium transition ${
              isActive
                ? 'bg-white text-black'
                : 'border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </Link>
        )
      })}
      <span
        className="rounded-full border border-dashed border-gray-700 px-4 py-2 text-gray-500"
        title="Coming later"
      >
        Software · soon
      </span>
      <span
        className="rounded-full border border-dashed border-gray-700 px-4 py-2 text-gray-500"
        title="Coming later"
      >
        Hardware · soon
      </span>
    </nav>
  )
}
