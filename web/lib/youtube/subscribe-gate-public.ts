/** Client-safe YouTube subscribe gate constants (no Node crypto). */
export const YOUTUBE_SUBSCRIBE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/youtube'

/** Session-only unlock shared by every EP on the page. */
export const YT_WATCH_SOFT_UNLOCK_STORAGE_KEY = 'yt_watch_soft_unlock'

const ytUnlockListeners = new Set<() => void>()
let ytUnlockGeneration = 0

export function readYtWatchSoftUnlock(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(YT_WATCH_SOFT_UNLOCK_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function ytWatchUnlockGeneration(): number {
  return ytUnlockGeneration
}

/** One subscribe covers every release section in this visit. */
export function markYtWatchSoftUnlock(): void {
  ytUnlockGeneration += 1
  try {
    sessionStorage.setItem(YT_WATCH_SOFT_UNLOCK_STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
  ytUnlockListeners.forEach((listener) => listener())
}

export function clearYtWatchSoftUnlock(): void {
  try {
    sessionStorage.removeItem(YT_WATCH_SOFT_UNLOCK_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function subscribeYtWatchUnlock(listener: () => void): () => void {
  ytUnlockListeners.add(listener)
  return () => {
    ytUnlockListeners.delete(listener)
  }
}

/** Query flag: which release to reopen after Google sends the fan back. */
export const YT_SUB_GATE_RETURN_FOLDER_PARAM = 'ytv'

/** Named floating window so a second click focuses the same popup. */
export const YT_SUB_GATE_POPUP_NAME = 'sergik-youtube-subscribe'

/** localStorage key the popup writes so the music library can unlock without navigating. */
export const YT_SUB_GATE_POPUP_STORAGE_KEY = 'yt_sub_gate_popup_result'

export const YT_SUB_GATE_POPUP_MESSAGE = 'sergik-yt-sub'

const POPUP_FLAGS = new Set(['ok', 'denied', 'unsubscribed', 'unconfigured', 'channel', 'state', 'error'])

export function youtubeSubscribePopupFlag(flag: string): string {
  return POPUP_FLAGS.has(flag) ? flag : 'error'
}

/** Features that ask the browser for a small window, not a new tab. */
export function youtubeSubscribePopupFeatures(origin: {
  screenX: number
  screenY: number
  outerWidth: number
  outerHeight: number
}): string {
  const width = 480
  const height = 680
  const left = Math.round(origin.screenX + Math.max(0, (origin.outerWidth - width) / 2))
  const top = Math.round(origin.screenY + Math.max(0, (origin.outerHeight - height) / 2))
  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

/** Page shown inside the floating window after Google returns. Closes that window. */
export function youtubeSubscribePopupCloseHtml(flag: string): string {
  const safe = youtubeSubscribePopupFlag(flag)
  const payload = JSON.stringify({ flag: safe, t: Date.now() })
  const title = safe === 'ok' ? 'Subscribed' : 'Sign-in'
  const line = safe === 'ok' ? 'Subscribed. Returning to SERGIK…' : 'Returning to SERGIK…'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:14px/1.4 system-ui,sans-serif;text-align:center}
  p{max-width:16rem;margin:0;padding:1.5rem}
</style>
</head>
<body>
<p>${line}</p>
<script>
try { localStorage.setItem(${JSON.stringify(YT_SUB_GATE_POPUP_STORAGE_KEY)}, ${JSON.stringify(payload)}); } catch (e) {}
try {
  if (window.opener) {
    window.opener.postMessage({ source: ${JSON.stringify(YT_SUB_GATE_POPUP_MESSAGE)}, flag: ${JSON.stringify(safe)} }, window.location.origin);
    window.opener.focus();
  }
} catch (e) {}
function shut() { try { window.close(); } catch (e) {} }
shut();
setTimeout(shut, 200);
</script>
</body>
</html>`
}

/**
 * Return path stored in the OAuth state. The floating window itself is closed
 * by the callback page and does not load the music library.
 */
export function youtubeSubscribeGateReturnPath(href: string, folderId: string): string {
  const url = new URL(href, 'http://localhost')
  url.searchParams.delete('ytgate')
  const folder = folderId.trim()
  if (folder) url.searchParams.set(YT_SUB_GATE_RETURN_FOLDER_PARAM, folder.slice(0, 200))
  else url.searchParams.delete(YT_SUB_GATE_RETURN_FOLDER_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

/** Opens the small subscribe window. The music page stays put. */
export function youtubeSubscribePopupHref(email: string): string {
  return `/api/youtube/subscribe-gate/intent?email=${encodeURIComponent(email.trim())}`
}

/** Smaller than the old sign-in window: just the channel subscribe button. */
export function youtubeSubscribeButtonPopupFeatures(origin: {
  screenX: number
  screenY: number
  outerWidth: number
  outerHeight: number
}): string {
  const width = 400
  const height = 460
  const left = Math.round(origin.screenX + Math.max(0, (origin.outerWidth - width) / 2))
  const top = Math.round(origin.screenY + Math.max(0, (origin.outerHeight - height) / 2))
  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

/** Page shown inside the small popup. It holds YouTube's Subscribe link. */
export const YT_SUBSCRIBE_SMART_LINK_PATH = '/youtube-subscribe'

/**
 * YouTube cannot place its Subscribe button inside a window we own.
 * This opens YouTube's subscribe confirmation in the popup that is already open.
 */
export function youtubeSubscribeSmartLinkHref(channel: string): string {
  return youtubeChannelSubscribeHref(channel)
}

/** YouTube's own subscribe page. The fan subscribes there; SERGIK does not subscribe them. */
export function youtubeChannelSubscribeHref(channel: string): string {
  const handle = channel.replace(/^@/, '').trim() || 'sergikdropz'
  return `https://www.youtube.com/@${encodeURIComponent(handle)}?sub_confirmation=1`
}

export function youtubeSubscribeGateStartHref(href: string, folderId: string): string {
  const next = youtubeSubscribeGateReturnPath(href, folderId)
  return `/api/youtube/subscribe-gate/start?ui=popup&next=${encodeURIComponent(next)}`
}
