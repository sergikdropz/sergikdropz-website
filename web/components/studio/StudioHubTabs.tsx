'use client'

import Link from 'next/link'

export type StudioHubTab = {
  id: string
  label: string
  href: string
  hint?: string
}

type Props = {
  tabs: StudioHubTab[]
  active: string
  label: string
}

export default function StudioHubTabs({ tabs, active, label }: Props) {
  return (
    <div
      className="flex flex-wrap gap-1 mb-8 p-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 w-full sm:w-fit"
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            title={tab.hint}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              isActive
                ? 'bg-violet-600/25 text-violet-100 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
