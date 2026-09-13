'use client'

import { useState } from 'react'
import FollowEmailModal from '@/components/FollowEmailModal'

/** Client island: Follow CTA + email modal (homepage stays mostly RSC). */
export default function HomeFollowCta() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <FollowEmailModal open={open} onClose={() => setOpen(false)} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-target inline-flex min-h-[48px] min-w-[12rem] items-center justify-center rounded-ui border border-ink/80 bg-surface/90 px-8 py-3 text-base font-semibold text-ink transition hover:bg-ink hover:text-ink-inverse"
      >
        Follow
      </button>
    </>
  )
}
