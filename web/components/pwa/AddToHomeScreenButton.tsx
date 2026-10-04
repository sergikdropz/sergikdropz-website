'use client'

import { useEffect, useId, useState } from 'react'
import { MdAddToHomeScreen } from 'react-icons/md'
import { isStandaloneInstalledPwa } from '@/lib/ui/mobile-playback-profile'
import {
  canPromptPwaInstall,
  detectHomeScreenPlatform,
  promptPwaInstall,
  subscribePwaInstall,
  wasPwaInstalledThisSession,
  type HomeScreenPlatform,
} from '@/lib/pwa/install-prompt'

const GUIDE: Record<HomeScreenPlatform, { title: string; steps: string[] }> = {
  ios: {
    title: 'Add to Home Screen',
    steps: [
      'Tap the Share button in Safari (the square with the arrow).',
      'Scroll the share sheet and tap Add to Home Screen.',
      'Tap Add. SERGIK opens from your home screen like an app.',
    ],
  },
  android: {
    title: 'Add to Home Screen',
    steps: [
      'Open the browser menu (⋮).',
      'Tap Install app or Add to Home screen.',
      'Confirm. SERGIK is added to your home screen.',
    ],
  },
  desktop: {
    title: 'Install SERGIK',
    steps: [
      'Look for the install icon in the address bar.',
      'Or open the browser menu and choose Install SERGIK.',
      'Confirm. The app is added to your dock or home screen.',
    ],
  },
}

export default function AddToHomeScreenButton() {
  const titleId = useId()
  const [canPrompt, setCanPrompt] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [platform, setPlatform] = useState<HomeScreenPlatform>('desktop')

  useEffect(() => {
    setPlatform(detectHomeScreenPlatform())
    const sync = () => {
      setCanPrompt(canPromptPwaInstall())
      setInstalled(isStandaloneInstalledPwa() || wasPwaInstalledThisSession())
    }
    sync()
    return subscribePwaInstall(sync)
  }, [])

  useEffect(() => {
    if (!guideOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuideOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideOpen])

  const guide = GUIDE[platform]

  async function onClick() {
    if (installed) {
      setGuideOpen(true)
      return
    }
    const outcome = await promptPwaInstall()
    if (outcome === 'accepted') {
      setInstalled(true)
      setGuideOpen(false)
      return
    }
    if (outcome === 'unavailable') {
      setGuideOpen(true)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          void onClick()
        }}
        className="inline-flex h-11 w-11 items-center justify-center text-2xl text-gray-300 transition-colors hover:text-white md:h-12 md:w-12 md:text-3xl"
        aria-label={installed ? 'SERGIK is on your home screen' : 'Add to Home Screen'}
        aria-expanded={guideOpen}
        aria-haspopup={canPrompt ? undefined : 'dialog'}
        title={installed ? 'On your home screen' : 'Add to Home Screen'}
      >
        <MdAddToHomeScreen aria-hidden />
      </button>
      {guideOpen && (
        <button
          type="button"
          aria-label="Close add to home screen instructions"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setGuideOpen(false)}
        />
      )}
      {guideOpen && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-gray-600/80 bg-gray-950/95 p-3 text-left shadow-lg backdrop-blur-sm"
        >
          <p id={titleId} className="text-sm font-semibold text-white">
            {installed ? 'Already on your home screen' : guide.title}
          </p>
          {installed ? (
            <p className="mt-1 text-xs leading-snug text-gray-300">
              SERGIK is installed. Open it from your home screen or dock.
            </p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-300">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          <button
            type="button"
            className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white hover:text-gray-200"
            onClick={() => setGuideOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
