'use client'

import StudioNav from './StudioNav'

type Props = {
  title?: string
  subtitle?: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export default function StudioPageShell({ title, subtitle, children, actions }: Props) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[360px] h-[360px] rounded-full bg-fuchsia-600/5 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/90 mb-2">
            Release Studio
          </p>
          {title && <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>}
          {subtitle && <p className="text-zinc-500 mt-2 max-w-2xl">{subtitle}</p>}
          {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
        </header>
        <StudioNav />
        {children}
      </div>
    </div>
  )
}
