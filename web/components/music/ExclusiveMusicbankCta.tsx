'use client'

import Link from 'next/link'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'

type ExclusiveMusicbankCtaProps = {
  className?: string
  /** Full-width stack (nav) vs centered hero block on /music */
  layout?: 'full' | 'hero'
  /** Extra line under the CTA — clarifies this is not the page heading for content below */
  showHint?: boolean
  prefetch?: boolean
}

export default function ExclusiveMusicbankCta({
  className = '',
  layout = 'hero',
  showHint = layout === 'hero',
  prefetch = layout !== 'hero',
}: ExclusiveMusicbankCtaProps) {
  const widthClass = layout === 'full' ? 'w-full' : 'w-full max-w-2xl sm:max-w-3xl'

  return (
    <div className={`flex flex-col items-center gap-2 ${widthClass} ${className}`}>
      <Link
        href="/music-library"
        prefetch={prefetch}
        aria-label="Open the exclusive SERGIK Music Vault"
        data-label="Exclusive Musicbank"
        className={`exclusive-musicbank-link group inline-flex min-h-[52px] ${widthClass} origin-center items-center justify-center gap-2.5 rounded-lg border-2 border-yellow-400/90 bg-black/45 px-3 py-2.5 text-center font-six-caps shadow-[0_0_22px_rgba(250,204,21,0.16)] touch-manipulation transition-all hover:border-yellow-200 hover:bg-black/60 hover:shadow-[0_0_28px_rgba(250,204,21,0.18)] active:scale-[0.99] sm:gap-4 sm:px-6 sm:py-3 md:px-10`}
      >
        <FaChevronLeft
          className="exclusive-musicbank-chevron h-4 w-4 shrink-0 text-yellow-400 sm:h-5 sm:w-5"
          aria-hidden
        />
        <span className="exclusive-musicbank-stretch inline-flex min-w-0 flex-1 justify-center">
          <span className="exclusive-musicbank-glow min-w-0 px-1 text-[clamp(1.75rem,4.2vw,3rem)] font-semibold leading-none tracking-[0.12em] sm:tracking-[0.16em] md:tracking-[0.2em] lg:tracking-[0.22em]">
            Exclusive Musicbank
          </span>
        </span>
        <FaChevronRight
          className="exclusive-musicbank-chevron exclusive-musicbank-chevron-right h-4 w-4 shrink-0 text-yellow-400 sm:h-5 sm:w-5"
          aria-hidden
        />
      </Link>
      <p className="text-center font-sans text-sm font-semibold normal-case leading-snug tracking-wide text-yellow-100 sm:text-base">
        Tap to open vault
      </p>
      {showHint ? (
        <p className="max-w-md px-1 text-center text-sm font-medium leading-snug text-yellow-100/90 sm:text-base">
          Get access to unreleased and exclusive music at the{' '}
          <span className="text-yellow-50">SERGIK Music Vault</span> — available only at sergikdropz.com.
        </p>
      ) : null}
    </div>
  )
}
