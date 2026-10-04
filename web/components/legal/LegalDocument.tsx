import type { ReactNode } from 'react'
import Link from 'next/link'

export function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="relative min-h-screen pt-20">
      <div className="container relative z-10 mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mb-10 text-sm text-gray-500">Last updated {updated}</p>
        <div className="space-y-8 text-base leading-relaxed text-gray-300 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 text-sm text-gray-500">
          <Link href="/privacy">Privacy Policy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms">Terms of Service</Link>
        </p>
      </div>
    </div>
  )
}
