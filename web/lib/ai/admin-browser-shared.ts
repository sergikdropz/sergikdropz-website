/** Layout size of the real Chromium window. The chat-column mirror only scales a picture of this. */
export const ADMIN_BROWSER_VIEWPORT = { width: 1440, height: 900 }
export const ADMIN_BROWSER_HOME = 'https://sergikdropz.com/music'

export type AdminBrowserActor = 'user' | 'assistant'

export type AdminBrowserActionName =
  | 'status'
  | 'frame'
  | 'open'
  | 'navigate'
  | 'back'
  | 'reload'
  | 'click'
  | 'wheel'
  | 'pointer'
  | 'viewport'
  | 'zoom'
  | 'type'
  | 'press'
  | 'read'
  | 'drive'
  | 'distrokid_prefill'
  | 'distrokid_upload_assets'
  | 'probe_fields'
  | 'inspect'
  | 'release'

export type AdminBrowserRequest = {
  action: AdminBrowserActionName
  url?: string
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  phase?: 'move' | 'down' | 'up'
  viewWidth?: number
  viewHeight?: number
  viewportWidth?: number
  viewportHeight?: number
  zoom?: number
  text?: string
  key?: string
  youDrive?: boolean
  actor: AdminBrowserActor
  dryRun?: boolean
  includeImage?: boolean
  /** DistroKid packet payload for distrokid_prefill (never submits). */
  distrokidPacket?: Record<string, unknown>
  /** When true, distrokid_prefill skips WAV/artwork uploads (use distrokid_upload_assets next). */
  skipDistrokidAssets?: boolean
  /** Admin AI chat id. Each chat gets its own page; cookies stay in one Chrome profile. */
  chatSessionId?: string
}

export const ADMIN_BROWSER_STUDIO_CHAT_ID = 'studio-mirror'

/** Stable id for a chat tab. Blank or unsafe values share the default page. */
export function normalizeAdminBrowserChatId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) return 'default'
  return id
}

export type AdminBrowserSnapshot = {
  ok: boolean
  enabled: boolean
  running: boolean
  youDrive: boolean
  url: string
  title: string
  text?: string
  error?: string
  imageBase64?: string
  width: number
  height: number
  distrokidPrefill?: {
    filled: string[]
    skipped: string[]
    errors: string[]
  }
  fieldProbe?: Array<{
    tag: string
    type: string
    name: string
    id: string
    placeholder: string
    label: string
    value: string
    checked?: boolean
    required?: boolean
    invalid?: boolean
  }>
  /** Element under a point in the live browser page (not the mirror div). */
  elementPick?: {
    text: string
    label: string
    top: number
    left: number
    width: number
    height: number
    viewportWidth: number
    viewportHeight: number
  }
}

export function parseBrowserUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed || trimmed.length > 2000) return null
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (scheme && scheme[1].toLowerCase() !== 'http' && scheme[1].toLowerCase() !== 'https') return null
  const withScheme = scheme ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function viewportPoint(xRatio: number, yRatio: number, width: number, height: number) {
  const x = Math.round(Math.min(1, Math.max(0, xRatio)) * Math.max(1, width - 1))
  const y = Math.round(Math.min(1, Math.max(0, yRatio)) * Math.max(1, height - 1))
  return { x, y }
}

export function scaleWheel(
  deltaX: number,
  deltaY: number,
  viewWidth: number,
  viewHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const sx = viewWidth > 0 ? viewportWidth / viewWidth : 1
  const sy = viewHeight > 0 ? viewportHeight / viewHeight : 1
  return { deltaX: deltaX * sx, deltaY: deltaY * sy }
}

export const ADMIN_BROWSER_ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

export function stepZoom(current: number, direction: -1 | 0 | 1) {
  let index = 0
  let best = Number.POSITIVE_INFINITY
  ADMIN_BROWSER_ZOOM_STEPS.forEach((step, i) => {
    const distance = Math.abs(step - current)
    if (distance < best) {
      best = distance
      index = i
    }
  })
  const next = Math.min(ADMIN_BROWSER_ZOOM_STEPS.length - 1, Math.max(0, index + direction))
  return ADMIN_BROWSER_ZOOM_STEPS[next]
}

/** Read-only looks stay available while the user has the mouse. */
export const ADMIN_BROWSER_READ_ONLY_ACTIONS = new Set<AdminBrowserActionName>([
  'status',
  'frame',
  'read',
  'probe_fields',
  'inspect',
])

/** Fill DistroKid fields/files while You drive stays on — never DistroKid Continue/Submit. */
export const ADMIN_BROWSER_FILL_WHILE_DRIVE = new Set<AdminBrowserActionName>([
  'distrokid_prefill',
  'distrokid_upload_assets',
])

export function assistantMayAct(youDrive: boolean, actor: AdminBrowserActor) {
  if (actor === 'user') return true
  return !youDrive
}

export function assistantMayRunBrowserAction(
  youDrive: boolean,
  actor: AdminBrowserActor,
  action: AdminBrowserActionName,
) {
  if (action === 'drive') return true
  if (ADMIN_BROWSER_READ_ONLY_ACTIONS.has(action)) return true
  if (ADMIN_BROWSER_FILL_WHILE_DRIVE.has(action)) return true
  return assistantMayAct(youDrive, actor)
}
