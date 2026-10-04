export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export type HomeScreenPlatform = 'ios' | 'android' | 'desktop'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallListener = () => void

let deferred: BeforeInstallPromptEvent | null = null
let installedThisSession = false
const listeners = new Set<InstallListener>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Capture the browser install prompt as soon as this module loads. */
export function bindPwaInstallCapture() {
  if (typeof window === 'undefined') return
  const host = window as Window & { __sergikPwaInstallBound?: boolean }
  if (host.__sergikPwaInstallBound) return
  host.__sergikPwaInstallBound = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    installedThisSession = true
    notify()
  })
}

export function subscribePwaInstall(listener: InstallListener) {
  bindPwaInstallCapture()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function canPromptPwaInstall() {
  return deferred != null
}

export function wasPwaInstalledThisSession() {
  return installedThisSession
}

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') {
      installedThisSession = true
      notify()
      return 'accepted'
    }
    return 'dismissed'
  } catch {
    return 'unavailable'
  }
}

export function detectHomeScreenPlatform(): HomeScreenPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (iOS) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}
