'use client'

/**
 * Read-only CDJ-style crossfader — shows blend position during Auto DJ overlap.
 * A = left (outgoing), B = right (incoming); knob at mixProgress (0→1).
 */
export default function MixCrossfader({
  progress,
  active = false,
  className = '',
}: {
  progress: number
  active?: boolean
  className?: string
}) {
  const p = Math.max(0, Math.min(1, progress))
  const pct = p * 100

  return (
    <div
      className={`flex flex-col items-center gap-1 ${className}`}
      role="presentation"
      aria-hidden={!active}
    >
      <div className="flex w-full items-center justify-between px-0.5 text-[8px] font-semibold uppercase tracking-wider text-gray-500">
        <span className={p < 0.45 ? 'text-amber-400/90' : ''}>A</span>
        <span className={active ? 'text-gray-400' : 'text-gray-600'}>XF</span>
        <span className={p > 0.55 ? 'text-sky-400/90' : ''}>B</span>
      </div>
      <div
        className={`relative h-28 w-9 rounded-md border px-1 py-1.5 ${
          active
            ? 'border-amber-500/35 bg-gradient-to-b from-gray-900 via-gray-950 to-gray-900 shadow-inner'
            : 'border-gray-800 bg-gray-950/80 opacity-60'
        }`}
      >
        <div className="absolute inset-x-2 top-2 bottom-2 rounded-full bg-gray-800/90" />
        <div
          className={`absolute left-1/2 w-7 -translate-x-1/2 rounded-sm border shadow-md transition-[bottom] duration-75 ease-linear ${
            active
              ? 'border-gray-400 bg-gradient-to-b from-gray-200 to-gray-400'
              : 'border-gray-600 bg-gray-600'
          }`}
          style={{
            height: '14px',
            bottom: `calc(${pct}% * (100% - 14px - 8px) / 100 + 4px)`,
          }}
        />
      </div>
      {active && (
        <span className="font-mono text-[9px] tabular-nums text-gray-500">{Math.round(pct)}%</span>
      )}
    </div>
  )
}
