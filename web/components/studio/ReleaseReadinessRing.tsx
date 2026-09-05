'use client'

type Props = {
  score: number
  size?: number
  label?: string
}

export default function ReleaseReadinessRing({ score, size = 56, label }: Props) {
  const clamped = Math.min(100, Math.max(0, score))
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  const color =
    clamped >= 85 ? '#34d399' : clamped >= 55 ? '#a78bfa' : clamped >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div
      className="relative inline-flex"
      style={{ width: size, height: size }}
      aria-label={label || `Readiness ${clamped} percent`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
        {clamped}%
      </span>
    </div>
  )
}
