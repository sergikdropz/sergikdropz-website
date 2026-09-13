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
