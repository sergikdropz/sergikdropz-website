'use client'

import Link from 'next/link'

type Department = {
  id: string
  title: string
  description: string
  href?: string
  status: 'live' | 'soon'
  accent: string
}

const DEPARTMENTS: Department[] = [
  {
    id: 'music',
    title: 'Music Shop',
    description: 'Streaming catalog downloads, member vault picks, exclusives, beats, bundles, and membership.',
    href: '/shop/music',
    status: 'live',
    accent: 'border-purple-500/40 hover:border-purple-400/60',
  },
  {
    id: 'merch',
    title: 'Merch Shop',
    description: 'Print-on-demand apparel and goods — shipped worldwide.',
    href: '/shop/merch',
    status: 'live',
    accent: 'border-emerald-500/40 hover:border-emerald-400/60',
  },
  {
    id: 'software',
    title: 'Software Shop',
    description: 'DJ tools and apps — coming in a future drop.',
    status: 'soon',
    accent: 'border-gray-700',
  },
  {
    id: 'hardware',
    title: 'Hardware Shop',
    description: 'Controllers and gear — planned for later.',
    status: 'soon',
    accent: 'border-gray-700',
  },
]

function DepartmentCard({ dept }: { dept: Department }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-six-caps text-2xl tracking-[0.1em] text-white sm:text-3xl">{dept.title}</h2>
        {dept.status === 'soon' ? (
          <span className="shrink-0 rounded-full border border-gray-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Soon
          </span>
        ) : (
          <span className="shrink-0 text-sm text-gray-400">Open →</span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-400">{dept.description}</p>
    </>
  )

  const className = `rounded-xl border bg-gray-900/50 p-6 text-left transition ${dept.accent} ${
    dept.status === 'live' ? 'hover:bg-gray-900/80' : 'opacity-60 cursor-not-allowed'
  }`

  if (dept.status === 'live' && dept.href) {
    return (
      <Link href={dept.href} className={`group block ${className}`}>
        {inner}
      </Link>
    )
  }

  return (
    <div className={className} aria-disabled="true">
      {inner}
    </div>
  )
}

export default function ShopDepartmentHub() {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
      {DEPARTMENTS.map((dept) => (
        <DepartmentCard key={dept.id} dept={dept} />
      ))}
    </div>
  )
}
