'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'

type PlatformCollapseProps = {
  title: string
  titleClassName: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

/** Collapsible streaming platform — expanded body attaches flush under the header. */
export function PlatformCollapse({
  title,
  titleClassName,
  expanded,
  onToggle,
  children,
}: PlatformCollapseProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-gray-800/80 bg-gray-900/40 transition-colors ${
        expanded ? 'border-gray-700' : 'hover:border-gray-700'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`relative flex w-full items-center justify-center px-10 py-3 text-center transition-colors hover:bg-gray-900/70 touch-manipulation sm:px-12 ${
          expanded ? 'border-b border-gray-800/80' : ''
        }`}
      >
        <h2 className={`text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl ${titleClassName}`}>
          {title}
        </h2>
        <span
          className={`absolute right-3 top-1/2 shrink-0 -translate-y-1/2 text-gray-400 transition-transform duration-200 sm:right-4 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {expanded ? (
        <div className="bg-gray-900/80 p-4 sm:p-6">{children}</div>
      ) : null}
    </div>
  )
}

type PlatformLinkPanelProps = {
  href: string
  label: string
  accentClassName: string
  description?: string
}

/** Expanded body content for platforms without rich embeds. */
export function PlatformLinkPanel({
  href,
  label,
  accentClassName,
  description,
}: PlatformLinkPanelProps) {
  return (
    <div>
      {description ? (
        <p className="mb-4 text-sm text-gray-400 sm:text-base">{description}</p>
      ) : null}
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex min-h-[44px] items-center gap-1 text-sm font-medium transition-colors touch-manipulation sm:min-h-0 ${accentClassName}`}
      >
        <span>{label}</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  )
}
