'use client'

const BADGE_TITLE =
  'Mobile DJ mode: native audio keeps Auto DJ and iDJ playing when the screen locks. Volume crossfades are live; strip EQ is visual-only. Enable Live analyzer in player settings for full Web Audio EQ.'

export default function MobileDjModeBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex max-w-[11rem] items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-sky-200 sm:max-w-none sm:text-[10px] ${className}`}
      title={BADGE_TITLE}
    >
      Mobile DJ
    </span>
  )
}
