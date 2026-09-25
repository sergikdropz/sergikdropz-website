'use client'

import { useEffect, useState } from 'react'
import {
  MOBILE_DJ_COACH_DISMISSED_KEY,
  PWA_INSTALL_NUDGE_DISMISSED_KEY,
  isStandaloneInstalledPwa,
  prefersCoarseMobilePlayback,
} from '@/lib/ui/mobile-playback-profile'

type MobileListeningOverlaysProps = {
  showDjCoach: boolean
  showPwaNudge: boolean
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function dismissKey(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* ignore */
  }
}

export default function MobileListeningOverlays({
  showDjCoach,
  showPwaNudge,
}: MobileListeningOverlaysProps) {
  const [djCoachVisible, setDjCoachVisible] = useState(false)
  const [pwaVisible, setPwaVisible] = useState(false)

  useEffect(() => {
    if (!prefersCoarseMobilePlayback()) return
    if (showDjCoach && !readDismissed(MOBILE_DJ_COACH_DISMISSED_KEY)) {
      setDjCoachVisible(true)
    }
  }, [showDjCoach])

  useEffect(() => {
    if (!prefersCoarseMobilePlayback()) return
    if (isStandaloneInstalledPwa()) return
    if (!showPwaNudge || readDismissed(PWA_INSTALL_NUDGE_DISMISSED_KEY)) return
    setPwaVisible(true)
  }, [showPwaNudge])

  if (!djCoachVisible && !pwaVisible) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[45] flex flex-col gap-2 px-3 sm:px-4"
      style={{
        bottom: 'calc(var(--global-music-player-height, 5.5rem) + env(safe-area-inset-bottom, 0px) + 0.5rem)',
      }}
    >
      {djCoachVisible && (
        <div
          role="status"
          className="pointer-events-auto mx-auto w-full max-w-md rounded-xl border border-sky-500/35 bg-gray-950/95 px-3 py-2.5 text-left shadow-lg backdrop-blur-sm"
        >
          <p className="text-xs leading-snug text-gray-100">
            <span className="font-semibold text-sky-200">Mobile DJ mode</span> keeps Auto DJ and iDJ
            playing when the screen locks. Mixes use volume crossfades; enable{' '}
            <span className="text-gray-200">Live analyzer</span> in settings for full Web Audio EQ.
          </p>
          <button
            type="button"
            className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-sky-300 hover:text-sky-100"
            onClick={() => {
              dismissKey(MOBILE_DJ_COACH_DISMISSED_KEY)
              setDjCoachVisible(false)
            }}
          >
            Got it
          </button>
        </div>
      )}
      {pwaVisible && (
        <div
          role="status"
          className="pointer-events-auto mx-auto w-full max-w-md rounded-xl border border-gray-600/80 bg-gray-950/95 px-3 py-2.5 text-left shadow-lg backdrop-blur-sm"
        >
          <p className="text-xs leading-snug text-gray-200">
            For app-like playback and reliable lock-screen controls, add SERGIK to your home screen
            (Share → Add to Home Screen on iPhone).
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-wide text-white hover:text-gray-200"
              onClick={() => {
                dismissKey(PWA_INSTALL_NUDGE_DISMISSED_KEY)
                setPwaVisible(false)
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
