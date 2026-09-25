/**
 * Mobile / coarse-device playback and paint budgets — keep HTML audio for lock-screen
 * listening and cap canvas + timer work so phones stay cool.
 */

/** ~15 fps — enough for playhead motion without heating the GPU. */
export const MOBILE_WAVEFORM_PAINT_MIN_MS = 67

/** Defer queue prefetch until the current track has been playing this long (mobile). */
export const MOBILE_AUDIO_PRELOAD_DEFER_MS = 5000

/** User explicitly chose Live analyzer on a phone (Web Audio + lock-screen tradeoff). */
export const MOBILE_LIVE_ANALYZER_OPT_IN_KEY = 'sergik.mobileLiveAnalyzerOptIn'

/** One-time coach when Auto DJ / iDJ runs in native lock-screen mode. */
export const MOBILE_DJ_COACH_DISMISSED_KEY = 'sergik.mobileDjCoachDismissed'

/** After first mobile play, suggest Add to Home Screen. */
export const PWA_INSTALL_NUDGE_DISMISSED_KEY = 'sergik.pwaInstallNudgeDismissed'

export type NetworkPlaybackTier = 'slow' | 'medium' | 'fast'

export type NetworkPlaybackSnapshot = {
  tier: NetworkPlaybackTier
  /** Save-Data, cellular, or very slow effective type — cap prefetch / waveform fetch. */
  constrained: boolean
  effectiveType: string | null
  saveData: boolean
  connectionType: string | null
}

export function mobileLiveAnalyzerOptIn(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MOBILE_LIVE_ANALYZER_OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

/** Background / lock-screen playback defaults on for phones unless Live analyzer was chosen. */
export function resolveMobilePrioritizeBackgroundPlayback(
  savedPrioritizeBackground?: boolean,
): boolean {
  if (!prefersCoarseMobilePlayback()) {
    return savedPrioritizeBackground ?? true
  }
  if (mobileLiveAnalyzerOptIn()) {
    return false
  }
  return true
}

export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/**
 * iOS / Android phones and tablets where Web Audio suspends on lock screen.
 */
export function prefersCoarseMobilePlayback(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (uaData?.mobile === true) return true
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1)
  return isIOS || /Android/i.test(ua)
}

export function readNetworkPlaybackSnapshot(): NetworkPlaybackSnapshot {
  if (typeof navigator === 'undefined') {
    return {
      tier: 'fast',
      constrained: false,
      effectiveType: null,
      saveData: false,
      connectionType: null,
    }
  }

  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string
      saveData?: boolean
      type?: string
    }
    mozConnection?: { effectiveType?: string; saveData?: boolean; type?: string }
    webkitConnection?: { effectiveType?: string; saveData?: boolean; type?: string }
  }

  const connection = nav.connection || nav.mozConnection || nav.webkitConnection
  const effectiveType = connection?.effectiveType ?? null
  const saveData = Boolean(connection?.saveData)
  const connectionType = connection?.type ?? null
  const cellular = connectionType === 'cellular'

  let tier: NetworkPlaybackTier = 'fast'
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    tier = 'slow'
  } else if (effectiveType === '3g') {
    tier = 'medium'
  }

  const constrained =
    saveData ||
    cellular ||
    tier === 'slow' ||
    (prefersCoarseMobilePlayback() && tier === 'medium')

  return { tier, constrained, effectiveType, saveData, connectionType }
}

export function tierToStreamQualityLabel(tier: NetworkPlaybackTier): 'standard' | 'HD' | 'UHD' {
  if (tier === 'slow') return 'standard'
  if (tier === 'medium') return 'HD'
  return 'UHD'
}

export function tierToAutoBufferSize(tier: NetworkPlaybackTier): 'small' | 'medium' | 'large' {
  if (tier === 'slow') return 'small'
  if (tier === 'medium') return 'medium'
  return 'large'
}

export function clampCanvasDprForDevice(dpr: number, lowPower: boolean): number {
  const clamped = Math.min(2, Math.max(1, dpr))
  return lowPower ? 1 : clamped
}

export function mobileQueuePreloadCount(options?: {
  constrained?: boolean
  documentHidden?: boolean
}): number {
  if (!prefersCoarseMobilePlayback()) return 3
  if (options?.documentHidden) return 0
  if (options?.constrained) return 0
  return 1
}

/** Low-power waveform: phones in listen mode, or reduced-motion preference. */
export function prefersLowPowerWaveformPaint(options: {
  djMixerActive: boolean
  reducedMotion?: boolean
}): boolean {
  if (options.reducedMotion) return true
  if (!prefersCoarseMobilePlayback()) return false
  return !options.djMixerActive
}

/** Gate heavy waveform decode on cellular / Save-Data unless the user opened the full player. */
export function mobileWaveformNetworkAllowed(
  playing: boolean,
  expanded: boolean,
  docked: boolean,
  constrained: boolean,
): boolean {
  if (constrained && !expanded && !docked) return false
  return playing || expanded || docked
}

export function isStandaloneInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch {
    /* ignore */
  }
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true
}

/**
 * Auto DJ / iDJ on phones: keep both decks on HTMLMediaElement output (no MES) so
 * lock-screen playback works. EQ/filter automation is degraded to volume crossfades.
 */
export function prefersNativeMixerOutput(
  prioritizeBackgroundPlayback: boolean,
  djMixerActive: boolean,
): boolean {
  return (
    prefersCoarseMobilePlayback() &&
    prioritizeBackgroundPlayback &&
    djMixerActive
  )
}
