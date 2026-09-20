'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useClampedFixedMenuPosition } from '@/hooks/useClampedFixedMenuPosition'
import {
  GAIN_SHAPE_OPTIONS,
  patchBlendAutomation,
  readBlendAutomation,
  type BlendAutomation,
  type BlendGainShape,
} from '@/lib/audio/mix-engine/blend-automation'

function OptionRow({
  selected,
  label,
  onPick,
}: {
  selected: boolean
  label: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={`rounded px-1.5 py-1 text-[10px] ${
        selected ? 'bg-violet-500/20 text-violet-100' : 'text-gray-300 hover:bg-gray-800'
      }`}
      onClick={onPick}
    >
      {label}
    </button>
  )
}

/** Right-click panel for volume crossfader gain law. EQ dials stay independent. */
export function BlendAutomationMenu({
  anchor,
  onClose,
}: {
  anchor: { x: number; y: number } | null
  onClose: () => void
}) {
  const [curve, setCurve] = useState<BlendAutomation>(() => readBlendAutomation())
  const open = Boolean(anchor)
  const menuClamp = useClampedFixedMenuPosition(open, anchor, { width: 260, height: 140 })

  useEffect(() => {
    if (open) setCurve(readBlendAutomation())
  }, [open, anchor?.x, anchor?.y])

  if (!open || typeof document === 'undefined') return null

  const apply = (patch: Partial<BlendAutomation>) => {
    const next = patchBlendAutomation(patch)
    setCurve(next)
  }

  return createPortal(
    <div
      ref={menuClamp.ref}
      {...menuClamp.rootProps}
      role="menu"
      aria-label="Crossfader volume curve"
      data-blend-automation-menu=""
      data-allow-scroll-when-locked=""
      className="fixed w-[min(16rem,calc(100vw-1rem))] rounded-lg border border-gray-700 bg-gray-950 px-2 py-2 shadow-2xl"
      style={menuClamp.style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Volume curve
      </p>
      <div className="mb-2 grid grid-cols-3 gap-1" role="group" aria-label="Volume curve">
        {GAIN_SHAPE_OPTIONS.map((o) => (
          <OptionRow
            key={o.id}
            selected={curve.gainShape === o.id}
            label={o.label}
            onPick={() => apply({ gainShape: o.id as BlendGainShape })}
          />
        ))}
      </div>
      <p className="mt-1 px-1.5 text-[10px] leading-snug text-gray-500">
        Crossfader is volume only. EQ dials stay on the strip. Filter, Cut, and Bass-swap keep
        their own envelopes.
      </p>
      <button
        type="button"
        className="mt-1 w-full rounded px-1.5 py-1 text-left text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-200"
        onClick={onClose}
      >
        Close
      </button>
    </div>,
    document.body,
  )
}
