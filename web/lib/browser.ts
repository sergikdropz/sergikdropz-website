/**
 * Browsers where backdrop-filter + heavy CSS animation are especially expensive.
 * Includes desktop Safari and all iOS browsers (they share WebKit).
 */
export function isSafariOrIOSWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  const isDesktopSafari =
    /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|CriOS|FxiOS|EdgiOS/i.test(ua)
  return isIOS || isDesktopSafari
}

/**
 * Browsers where `position: fixed; bottom: 0` should follow `visualViewport`
 * (iOS WebKit + Android Chrome when the URL bar / keyboard resize the visible viewport).
 */
export function usesVisualViewportBottomInset(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (isSafariOrIOSWebKit()) return true
  if (!window.visualViewport) return false
  return /Android/i.test(navigator.userAgent)
}
