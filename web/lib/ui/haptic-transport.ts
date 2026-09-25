/** Light tap feedback on play / skip (Android and some iOS builds). */
export function hapticTransportTap(): void {
  if (typeof window === 'undefined') return
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate?.(12)
  } catch {
    /* ignore */
  }
}
