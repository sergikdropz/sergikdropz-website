'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { FaGripVertical } from 'react-icons/fa'

type HeaderProps = HTMLAttributes<HTMLDivElement> & {
  'data-popup-menu-drag-handle'?: string
}

/** Shared drag handle strip for fixed popup menus. */
export default function PopupMenuDragHeader({
  title,
  headerProps,
  trailing,
  className = '',
}: {
  title: ReactNode
  headerProps: HeaderProps
  trailing?: ReactNode
  className?: string
}) {
  const { className: handleClassName = '', ...rest } = headerProps
  return (
    <div
      {...rest}
      className={`sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-900/95 px-3 py-1.5 ${handleClassName} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FaGripVertical className="h-3 w-3 shrink-0 text-gray-600" aria-hidden />
        <div className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </div>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  )
}
