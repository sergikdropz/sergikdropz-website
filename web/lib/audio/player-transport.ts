/**
 * Bridge so Now Playing chrome (outside MusicPlayer) can drive the real player
 * without lifting all transport state into React context.
 */

export type PlayerTransportCommand =
  | 'togglePlay'
  | 'previous'
  | 'next'
  | 'toggleShuffle'
  | 'cycleRepeat'

export type PlayerTransportSettingsSnapshot = {
  isShuffled: boolean
  repeatMode: 'off' | 'all' | 'one'
}

export const PLAYER_TRANSPORT_EVENT = 'sergik-player-transport'
export const PLAYER_SETTINGS_EVENT = 'sergik-player-settings'

export function dispatchPlayerTransport(cmd: PlayerTransportCommand): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PLAYER_TRANSPORT_EVENT, { detail: { cmd } }))
}

export function dispatchPlayerSettings(snapshot: PlayerTransportSettingsSnapshot): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PLAYER_SETTINGS_EVENT, { detail: snapshot }))
}

export function readPlayerTransportSettings(): PlayerTransportSettingsSnapshot {
  const fallback: PlayerTransportSettingsSnapshot = { isShuffled: false, repeatMode: 'off' }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem('musicPlayerSettings')
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PlayerTransportSettingsSnapshot>
    const mode = parsed.repeatMode
    return {
      isShuffled: Boolean(parsed.isShuffled),
      repeatMode: mode === 'all' || mode === 'one' || mode === 'off' ? mode : 'off',
    }
  } catch {
    return fallback
  }
}
