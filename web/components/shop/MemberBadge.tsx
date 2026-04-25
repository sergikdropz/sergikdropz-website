'use client'

interface MemberBadgeProps {
  planId: string
  className?: string
}

const planBadges: Record<string, { label: string; color: string }> = {
  supporter: { label: 'Supporter', color: 'bg-purple-600 text-white' },
  'inner-circle': { label: 'Inner Circle', color: 'bg-yellow-500 text-black' },
}

export default function MemberBadge({ planId, className = '' }: MemberBadgeProps) {
  const badge = planBadges[planId]
  if (!badge) return null

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded ${badge.color} ${className}`}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
      {badge.label}
    </span>
  )
}
