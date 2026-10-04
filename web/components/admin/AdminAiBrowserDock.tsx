'use client'

import { FormEvent, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { AdminBrowserSnapshot } from '@/lib/ai/admin-browser-shared'
import { ADMIN_BROWSER_VIEWPORT, stepZoom } from '@/lib/ai/admin-browser-shared'
import type { AdminBrowserHydrateDetail } from '@/lib/ai/admin-browser-hydrate'
import {
  hydrateDeskLabel,
  hydratePasteText,
  hydrateSourceLabel,
  isAdminBrowserHydrateDetail,
} from '@/lib/ai/admin-browser-hydrate'
import {
  consumePendingAdminAiBrowserHydrate,
  subscribeAdminAiBrowserHydrate,
} from '@/lib/admin-ai-client'
import { DISTROKID_MY_MUSIC_URL } from '@/lib/studio/distrokid-delivery'

const HOMES = [
  { label: 'Site', url: 'https://sergikdropz.com/music' },
  { label: 'Spotify', url: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H' },
  { label: 'Spotify Artists', url: 'https://artists.spotify.com' },
  { label: 'YouTube', url: 'https://www.youtube.com/@sergikdropz' },
  { label: 'YouTube Studio', url: 'https://studio.youtube.com' },
  { label: 'SoundCloud', url: 'https://soundcloud.com/sergikdropz' },
  { label: 'Instagram', url: 'https://www.instagram.com/sergikdropz/' },
  { label: 'Facebook', url: 'https://www.facebook.com/Sergikdropz' },
  { label: 'Apple Artists', url: 'https://artists.apple.com' },
  { label: 'DistroKid', url: 'https://distrokid.com/mymusic/' },
  { label: 'SoundExchange', url: 'https://isrc.soundexchange.com/' },
  { label: 'SX Direct', url: 'https://sxdirect.soundexchange.com/home/' },
  { label: 'US ISRC', url: 'https://www.usisrc.org/' },
  { label: 'Revelator', url: 'https://platform.revelator.com' },
]

const PAGE_KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'PageDown',
  'PageUp',
  'Delete',
  'Home',
  'End',
  ' ',
])

function browserErrorFromBody(
  status: number,
  raw: string,
  data: AdminBrowserSnapshot & { error?: string; message?: string }
): string {
  if (data.error?.trim()) return data.error.trim()
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim()
  if (status === 401) return 'Sign in as admin again, then retry the browser.'
  if (status === 429) return 'Browser rate limit — wait a few seconds and retry.'
  if (status === 503) return 'Admin browser unavailable on this host (local dev Mac only).'
  const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (snippet && !snippet.startsWith('<!')) return `HTTP ${status}: ${snippet}`
  return `Browser request failed (HTTP ${status}). Check the dev server terminal or close any stuck Chromium profile window.`
}

async function postBrowser(body: Record<string, unknown>): Promise<AdminBrowserSnapshot> {
  let response: Response
  try {
    response = await fetch('/api/admin/ai/browser', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return {
      ok: false,
      enabled: true,
      running: false,
      youDrive: true,
      url: '',
      title: '',
      error: err instanceof Error ? err.message : 'Network error talking to the admin browser API.',
      width: 960,
      height: 640,
    }
  }
  const raw = await response.text()
  let data = {} as AdminBrowserSnapshot & { error?: string; message?: string }
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    data = {
      ok: false,
      enabled: true,
      running: false,
      youDrive: true,
      url: '',
      title: '',
      width: 960,
      height: 640,
    }
  }
  if (!response.ok && !data.error) {
    return {
      ok: false,
      enabled: data.enabled ?? true,
      running: data.running ?? false,
      youDrive: data.youDrive ?? true,
      url: data.url ?? '',
      title: data.title ?? '',
      error: browserErrorFromBody(response.status, raw, data),
      width: data.width ?? 960,
      height: data.height ?? 640,
    }
  }
  if (!response.ok && data.error) {
    return { ...data, ok: false }
  }
  return data
}

function ratios(target: HTMLElement, clientX: number, clientY: number) {
  const rect = target.getBoundingClientRect()
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
    viewWidth: rect.width,
    viewHeight: rect.height,
  }
}

const BROWSER_EXPANDED_KEY = 'admin-ai-browser-stack-expanded'
const BROWSER_SIDE_EXPANDED_KEY = 'admin-ai-browser-side-expanded'
const BROWSER_STUDIO_MIRROR_EXPANDED_KEY = 'admin-ai-browser-studio-mirror-expanded'
const BROWSER_HEIGHT_KEY = 'admin-ai-browser-height'
const BROWSER_STUDIO_MIRROR_HEIGHT_KEY = 'admin-ai-browser-studio-mirror-height'
const BROWSER_MIN_H = 160
const BROWSER_DEFAULT_H = 365
const BROWSER_STUDIO_MIRROR_DEFAULT_H = 320
const BROWSER_ZOOM_KEY = 'admin-ai-browser-zoom'

export type AdminAiBrowserDockLayout = 'stack' | 'side'
export type AdminAiBrowserDockVariant = 'admin' | 'studio'

export default function AdminAiBrowserDock({
  layout = 'stack',
  variant = 'admin',
  defaultExpanded,
  listenForHydrate = true,
  expanded: expandedProp,
  onExpandedChange,
  expandedStorageKey: expandedStorageKeyProp,
  onWorkspaceExpand,
  onExitWorkspace,
  persistExpanded = true,
  chatSessionId,
  assistantActing = false,
  taskNotice = null,
}: {
  /** `side` = fill a right-hand column (standalone window). `stack` = strip under chat header. */
  layout?: AdminAiBrowserDockLayout
  /** `studio` = embedded under Release Studio cards (zinc chrome, collapsed by default). */
  variant?: AdminAiBrowserDockVariant
  /** Initial expand when localStorage has no preference yet. */
  defaultExpanded?: boolean
  /** When false, do not auto-open/navigate on studio hydrate events (mirror under DistroKid card). */
  listenForHydrate?: boolean
  /** Controlled expand; omit for uncontrolled (localStorage). */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Override which localStorage flag this dock reads and writes. */
  expandedStorageKey?: string
  /** Docked chat column: open the browser beside the chat. */
  onWorkspaceExpand?: () => void
  /** Workspace browser: put it back in the chat column. */
  onExitWorkspace?: () => void
  /** When false, this dock does not write its expand flag. */
  persistExpanded?: boolean
  /** Chat tab id. Each id keeps its own page. Omit only for a shared fallback. */
  chatSessionId?: string
  /** True while this chat's assistant turn is running. */
  assistantActing?: boolean
  /** In-progress or unfinished browser work, shown under the page title. */
  taskNotice?: string | null
} = {}) {
  const chatId = chatSessionId?.trim() || 'default'
  const chatIdRef = useRef(chatId)
  chatIdRef.current = chatId
  const browserPost = useCallback(async (body: Record<string, unknown>) => {
    const id = chatIdRef.current
    const snap = await postBrowser({ ...body, chatSessionId: id })
    if (id !== chatIdRef.current) return { ...snap, stale: true as const }
    return snap
  }, [])
  const side = layout === 'side'
  const studio = variant === 'studio'
  const expandedStorageKey =
    expandedStorageKeyProp ??
    (side
      ? BROWSER_SIDE_EXPANDED_KEY
      : studio
        ? BROWSER_STUDIO_MIRROR_EXPANDED_KEY
        : BROWSER_EXPANDED_KEY)
  const heightStorageKey = studio ? BROWSER_STUDIO_MIRROR_HEIGHT_KEY : BROWSER_HEIGHT_KEY
  const defaultExpand =
    defaultExpanded ?? (studio ? false : true)
  const defaultPageHeight = studio ? BROWSER_STUDIO_MIRROR_DEFAULT_H : BROWSER_DEFAULT_H
  const [zoom, setZoom] = useState(() => {
    if (typeof window === 'undefined') return 1
    const stored = Number(window.localStorage.getItem(BROWSER_ZOOM_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : 1
  })
  const [pageHeight, setPageHeight] = useState(() => {
    if (typeof window === 'undefined') return defaultPageHeight
    const stored = Number(window.localStorage.getItem(heightStorageKey))
    return Number.isFinite(stored) && stored >= BROWSER_MIN_H ? stored : defaultPageHeight
  })
  const [expandedUncontrolled, setExpandedUncontrolled] = useState(() => {
    if (typeof window === 'undefined') return defaultExpand
    const stored = window.localStorage.getItem(expandedStorageKey)
    if (stored === '0') return false
    if (stored === '1') return true
    return defaultExpand
  })
  const expandedControlled = expandedProp !== undefined
  const expanded = expandedControlled ? expandedProp : expandedUncontrolled
  const setExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === 'function' ? next(expanded) : next
      if (!expandedControlled) setExpandedUncontrolled(value)
      onExpandedChange?.(value)
    },
    [expanded, expandedControlled, onExpandedChange]
  )
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [frame, setFrame] = useState<AdminBrowserSnapshot | null>(null)
  const [hydrate, setHydrate] = useState<AdminBrowserHydrateDetail | null>(null)
  const [hydrateNote, setHydrateNote] = useState<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const addressRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef(frame)
  const wheelRef = useRef({ dx: 0, dy: 0, x: 0.5, y: 0.5, viewWidth: 960, viewHeight: 640 })
  const wheelFlying = useRef(false)
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null)
  const lastViewport = useRef('')
  const assistantLockedRef = useRef(false)
  const zoomByChat = useRef<Record<string, number>>({})
  const [frameChatId, setFrameChatId] = useState(chatId)
  if (frameChatId !== chatId) {
    zoomByChat.current[frameChatId] = zoom
    setFrameChatId(chatId)
    setFrame(null)
    setAddress('')
    setHydrate(null)
    setHydrateNote(null)
    lastViewport.current = ''
    const remembered = zoomByChat.current[chatId]
    if (typeof remembered === 'number' && remembered !== zoom) setZoom(remembered)
  }
  frameRef.current = frame

  const apply = useCallback((next: AdminBrowserSnapshot & { stale?: boolean }) => {
    if (next.stale) return
    const { stale: _stale, ...rest } = next
    setFrame((prev) => ({
      ...rest,
      title: rest.running ? rest.title || prev?.title || '' : rest.title || '',
      url: rest.running ? rest.url || prev?.url || '' : rest.url || '',
      imageBase64: rest.running ? rest.imageBase64 || prev?.imageBase64 : rest.imageBase64,
    }))
    const editingAddress = document.activeElement === addressRef.current
    if (!editingAddress && next.url && next.url !== 'about:blank') setAddress(next.url)
  }, [])

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      try {
        apply(await browserPost({ actor: 'user', ...body }))
      } finally {
        setBusy(false)
      }
    },
    [apply]
  )

  const sendInput = useCallback(
    async (body: Record<string, unknown>) => {
      const next = await browserPost({ actor: 'user', ...body })
      if (next.ok) apply(next)
      else if (next.error) apply(next)
    },
    [apply]
  )

  const pushViewport = useCallback(
    (height: number) => {
      const width = Math.round(surfaceRef.current?.clientWidth || 0)
      const nextHeight = Math.round(height)
      if (width < 200) return
      const key = `${width}x${nextHeight}`
      if (lastViewport.current === key) return
      lastViewport.current = key
      void sendInput({ action: 'viewport', viewportWidth: width, viewportHeight: nextHeight })
    },
    [sendInput]
  )

  useEffect(() => {
    if (!persistExpanded) return
    window.localStorage.setItem(expandedStorageKey, expanded ? '1' : '0')
  }, [expanded, expandedStorageKey, persistExpanded])

  useEffect(() => {
    if (!expandedControlled || expandedProp === undefined) return
    setExpandedUncontrolled(expandedProp)
  }, [expandedControlled, expandedProp])

  useEffect(() => {
    if (!expanded || !frame?.running) return
    const timer = window.setTimeout(() => {
      void sendInput({ action: 'zoom', zoom })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [expanded, frame?.running, zoom, sendInput])

  useEffect(() => {
    if (!expanded || !frame?.running || side) return
    const timer = window.setTimeout(() => {
      const width = ADMIN_BROWSER_VIEWPORT.width
      const height = ADMIN_BROWSER_VIEWPORT.height
      const key = `${width}x${height}`
      if (lastViewport.current === key) return
      lastViewport.current = key
      void sendInput({ action: 'viewport', viewportWidth: width, viewportHeight: height })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [expanded, frame?.running, side, sendInput])

  useEffect(() => {
    if (!side || !expanded || !frame?.running) return
    const surface = surfaceRef.current
    if (!surface) return
    let timer = 0
    const sync = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const h = Math.round(surface.clientHeight)
        const w = Math.round(surface.clientWidth)
        if (h < BROWSER_MIN_H || w < 200) return
        const reportedW = frameRef.current?.width ?? 0
        const reportedH = frameRef.current?.height ?? 0
        if (Math.abs(reportedW - w) < 24 && Math.abs(reportedH - h) < 24) {
          lastViewport.current = `${w}x${h}`
          return
        }
        pushViewport(h)
      }, 280)
    }
    sync()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null
    ro?.observe(surface)
    return () => {
      window.clearTimeout(timer)
      ro?.disconnect()
    }
  }, [side, expanded, frame?.running, pushViewport])

  useEffect(() => {
    let cancelled = false
    void browserPost({ action: 'status', actor: 'user' }).then((next) => {
      if (!cancelled) apply(next)
    })
    return () => {
      cancelled = true
    }
  }, [apply, chatId])

  useEffect(() => {
    if (!studio || expanded) return
    let cancelled = false
    const tick = async () => {
      const next = await browserPost({ action: 'status', actor: 'user' })
      if (!cancelled && next.ok) apply(next)
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [apply, expanded, studio])

  const applyHydrate = useCallback(
    async (detail: AdminBrowserHydrateDetail) => {
      setExpanded(true)
      setHydrate(detail)
      setHydrateNote(null)
      const pasteText = hydratePasteText(detail)
      try {
        if (pasteText) {
          await navigator.clipboard.writeText(pasteText)
        }
      } catch {
        // Clipboard may be blocked; Paste still types via Chromium.
      }
      setBusy(true)
      try {
        const status = await browserPost({ action: 'status', actor: 'user' })
        apply(status)
        const nav = await browserPost({
          actor: 'user',
          action: status.running ? 'navigate' : 'open',
          url: detail.url,
        })
        apply(nav)
        if (detail.kind === 'distrokid') {
          setHydrateNote(
            pasteText
              ? 'Worksheet on clipboard. Fill DistroKid in this signed-in desk, click a field if needed, then Paste worksheet. Mark submitted on the DistroKid schedule card after upload — this never auto-submits DistroKid.'
              : 'DistroKid desk opened. Clear blockers on the DistroKid schedule card, then hydrate again with a worksheet.'
          )
        } else {
          setHydrateNote(
            pasteText
              ? 'Caption on clipboard. Open compose on the desk, click into the text field, then Paste caption.'
              : 'Desk opened. Download the asset from Social promo, then upload manually in the browser.'
          )
        }
      } finally {
        setBusy(false)
      }
    },
    [apply]
  )

  useEffect(() => {
    if (!listenForHydrate) return
    const pending = consumePendingAdminAiBrowserHydrate()
    if (pending && isAdminBrowserHydrateDetail(pending)) void applyHydrate(pending)
    return subscribeAdminAiBrowserHydrate((detail) => {
      if (!isAdminBrowserHydrateDetail(detail)) return
      void applyHydrate(detail)
    })
  }, [applyHydrate, listenForHydrate])

  async function prefillDistroKidFromDesk() {
    if (!hydrate || hydrate.kind !== 'distrokid' || !hydrate.releaseId) return
    setBusy(true)
    setHydrateNote(null)
    try {
      const packetRes = await fetch(
        `/api/studio/releases/${encodeURIComponent(hydrate.releaseId)}/distrokid`,
        { credentials: 'same-origin' }
      )
      const packetJson = (await packetRes.json().catch(() => ({}))) as {
        error?: string
        packet?: { ok?: boolean; blockers?: string[]; release?: unknown; tracks?: unknown[] }
      }
      if (!packetRes.ok || !packetJson.packet?.release || !Array.isArray(packetJson.packet.tracks)) {
        setHydrateNote(packetJson.error || 'Could not load DistroKid packet for prefill.')
        return
      }
      if (packetJson.packet.blockers?.length) {
        setHydrateNote(`Fix blockers before prefill: ${packetJson.packet.blockers[0]}`)
        return
      }
      const nav = await browserPost({
        actor: 'user',
        action: 'navigate',
        url: hydrate.url || 'https://distrokid.com/new/',
      })
      apply(nav)
      await new Promise((r) => window.setTimeout(r, 1500))
      const prefill = await browserPost({
        actor: 'user',
        action: 'distrokid_prefill',
        distrokidPacket: {
          release: packetJson.packet.release,
          tracks: packetJson.packet.tracks,
        },
      })
      apply(prefill)
      const filled = prefill.distrokidPrefill?.filled?.length || 0
      const skipped = prefill.distrokidPrefill?.skipped?.length || 0
      setHydrateNote(
        [
          filled ? `Prefill filled ${filled} field(s).` : 'Prefill ran with no matched fields.',
          skipped ? `${skipped} skipped (WAVs/artwork/manual).` : null,
          'Social Media Pack stays off. Review file uploads, Continue in DistroKid — never auto-submit.',
        ]
          .filter(Boolean)
          .join(' ')
      )
    } finally {
      setBusy(false)
    }
  }

  async function pasteHydratedText() {
    if (!hydrate) return
    const pasteText = hydratePasteText(hydrate)
    if (!pasteText) return
    setBusy(true)
    setHydrateNote(null)
    try {
      apply(await browserPost({ actor: 'user', action: 'type', text: pasteText }))
      setHydrateNote(
        hydrate.kind === 'distrokid'
          ? 'Worksheet typed into the focused field. Finish the DistroKid form, then Mark submitted on the schedule card.'
          : 'Caption typed into the focused field. Review before posting.'
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!expanded || !frame?.running) return
    let cancelled = false
    let timer = 0
    const tick = async () => {
      if (cancelled) return
      const next = await browserPost({ action: 'frame', actor: 'user' })
      if (!cancelled && next.ok) apply(next)
      if (!cancelled) timer = window.setTimeout(() => void tick(), 140)
    }
    timer = window.setTimeout(() => void tick(), 140)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [apply, expanded, frame?.running])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const flushWheel = async () => {
      if (wheelFlying.current) return
      const pending = wheelRef.current
      if (!pending.dx && !pending.dy) return
      const payload = { ...pending }
      pending.dx = 0
      pending.dy = 0
      wheelFlying.current = true
      try {
        await sendInput({
          action: 'wheel',
          deltaX: payload.dx,
          deltaY: payload.dy,
          x: payload.x,
          y: payload.y,
          viewWidth: payload.viewWidth,
          viewHeight: payload.viewHeight,
        })
      } finally {
        wheelFlying.current = false
        if (wheelRef.current.dx || wheelRef.current.dy) void flushWheel()
      }
    }
    const onWheel = (event: WheelEvent) => {
      if (assistantLockedRef.current) {
        event.preventDefault()
        return
      }
      if (!frameRef.current?.running) return
      event.preventDefault()
      event.stopPropagation()
      const point = ratios(surface, event.clientX, event.clientY)
      wheelRef.current.dx += event.deltaX
      wheelRef.current.dy += event.deltaY
      wheelRef.current.x = point.x
      wheelRef.current.y = point.y
      wheelRef.current.viewWidth = point.viewWidth
      wheelRef.current.viewHeight = point.viewHeight
      void flushWheel()
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => surface.removeEventListener('wheel', onWheel)
  }, [sendInput, frame?.running, frame?.imageBase64, expanded])

  function onAddress(event: FormEvent) {
    event.preventDefault()
    const url = address.trim()
    if (!url) return
    void run({ action: frame?.running ? 'navigate' : 'open', url })
  }

  const lastMove = useRef(0)

  function onPointer(event: PointerEvent<HTMLDivElement>, phase: 'move' | 'down' | 'up') {
    if (assistantLockedRef.current) return
    if (!frame?.running) return
    if (phase === 'move' && event.buttons === 0) return
    if (phase === 'move' && Date.now() - lastMove.current < 40) return
    if (phase === 'move') lastMove.current = Date.now()
    if (phase === 'down') {
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.focus()
    }
    const point = ratios(event.currentTarget, event.clientX, event.clientY)
    void sendInput({ action: 'pointer', phase, ...point })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (assistantLockedRef.current) return
    if (!frame?.running) return
    if (event.metaKey || event.ctrlKey) {
      if (event.key === '=' || event.key === '+' || event.key === '-' || event.key === '0') {
        event.preventDefault()
        changeZoom(event.key === '-' ? -1 : event.key === '0' ? 0 : 1)
      }
      return
    }
    const key = event.key === ' ' ? 'Space' : event.key
    if (key.length === 1) {
      event.preventDefault()
      void sendInput({ action: 'type', text: key })
      return
    }
    if (!PAGE_KEYS.has(event.key) && key !== 'Space') return
    event.preventDefault()
    void sendInput({ action: 'press', key })
  }

  function changeZoom(direction: -1 | 1 | 0) {
    setZoom((current) => {
      const next = direction === 0 ? 1 : stepZoom(current, direction)
      zoomByChat.current[chatIdRef.current] = next
      window.localStorage.setItem(BROWSER_ZOOM_KEY, String(next))
      void sendInput({ action: 'zoom', zoom: next })
      return next
    })
  }

  function onResizeDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { startY: event.clientY, startH: pageHeight }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The drag still tracks pointermove on the handle if capture is unavailable.
    }
  }

  function onResizeMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = resizeRef.current
    if (!drag) return
    const max = Math.max(BROWSER_MIN_H, window.innerHeight - 180)
    const next = Math.round(Math.min(max, Math.max(BROWSER_MIN_H, drag.startH + (event.clientY - drag.startY))))
    setPageHeight(next)
  }

  function onResizeUp() {
    const drag = resizeRef.current
    resizeRef.current = null
    if (!drag) return
    setPageHeight((height) => {
      window.localStorage.setItem(heightStorageKey, String(height))
      return height
    })
  }

  const youDrive = frame?.youDrive !== false
  const assistantLocked = assistantActing && !youDrive
  assistantLockedRef.current = assistantLocked

  const chromeBorder = studio ? 'border-zinc-800' : 'border-gray-800'
  const chromeMuted = studio ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-300 hover:bg-gray-800'
  const chromeBtn = studio ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-300 hover:bg-gray-800'
  const chromeLabel = studio ? 'Desk mirror' : 'Browser'

  const chrome = (
        <div className={`flex items-center gap-1 px-2 py-1 ${expanded ? `border-b ${chromeBorder}` : ''}`}>
          <button
            type="button"
            onClick={() => {
              if (onExitWorkspace) onExitWorkspace()
              else setExpanded((open) => !open)
            }}
            aria-expanded={expanded}
            aria-label={
              onExitWorkspace
                ? 'Return browser to chat column'
                : expanded
                  ? 'Collapse browser mirror'
                  : 'Expand browser mirror'
            }
            title={
              onExitWorkspace
                ? 'Put the browser back in the chat column'
                : expanded
                  ? 'Collapse'
                  : 'Show the browser in the chat column'
            }
            className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chromeMuted}`}
          >
            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={expanded && !onExitWorkspace ? 'M5 8l5 5 5-5' : 'M8 5l5 5-5 5'}
              />
            </svg>
            {onExitWorkspace ? 'In column' : chromeLabel}
          </button>
          {expanded ? (
          <>
          <button
            type="button"
            disabled={busy || assistantLocked}
            onClick={() => void run({ action: 'back' })}
            className={`rounded px-1.5 py-0.5 text-[11px] disabled:opacity-40 ${chromeBtn}`}
          >
            Back
          </button>
          <button
            type="button"
            disabled={busy || assistantLocked || (!frame?.running && !address.trim())}
            onClick={() => {
              if (frame?.running) {
                void run({ action: 'reload' })
                return
              }
              const url = address.trim()
              if (!url) return
              void run({ action: 'open', url })
            }}
            className={`rounded px-1.5 py-0.5 text-[11px] disabled:opacity-40 ${chromeBtn}`}
          >
            {frame?.running ? 'Reload' : 'Open'}
          </button>
          <form onSubmit={onAddress} className="flex min-w-0 flex-1 items-center gap-1">
            <input
              ref={addressRef}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="https://"
              aria-label="Browser address"
              readOnly={assistantLocked}
              className={`min-w-0 flex-1 rounded border px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-600 ${
                studio ? 'border-zinc-700 bg-zinc-950' : 'border-gray-700 bg-gray-950'
              }`}
            />
            <button
              type="submit"
              disabled={busy || assistantLocked || !address.trim()}
              className={`rounded px-2 py-1 text-[11px] font-medium disabled:opacity-40 ${
                studio ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700' : 'bg-gray-800 text-gray-100 hover:bg-gray-700'
              }`}
            >
              Go
            </button>
          </form>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={busy || assistantLocked || zoom <= 0.5}
              onClick={() => changeZoom(-1)}
              className={`rounded px-1.5 py-0.5 text-[12px] disabled:opacity-40 ${chromeBtn}`}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              disabled={busy || assistantLocked}
              onClick={() => changeZoom(0)}
              className={`rounded px-1 py-0.5 text-[10px] tabular-nums disabled:opacity-40 ${
                studio ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={busy || assistantLocked || zoom >= 2}
              onClick={() => changeZoom(1)}
              className={`rounded px-1.5 py-0.5 text-[12px] disabled:opacity-40 ${chromeBtn}`}
            >
              +
            </button>
          </div>
          <button
            type="button"
            aria-pressed={youDrive}
            disabled={busy}
            onClick={() => void run({ action: 'drive', youDrive: !youDrive })}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              youDrive ? 'bg-amber-500 text-black' : studio ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
            title="You drive keeps the assistant from clicking or typing. Turn it off to let an approved assistant action use this page."
          >
            You drive
          </button>
          {onWorkspaceExpand ? (
            <button
              type="button"
              onClick={onWorkspaceExpand}
              aria-label="Expand browser"
              title="Expand the browser beside the chat"
              className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${chromeBtn}`}
            >
              Expand
            </button>
          ) : null}
          </>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className={`min-w-0 flex-1 truncate text-left text-[11px] ${
                studio ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {frame?.url && frame.url !== 'about:blank'
                ? frame.url.replace(/^https?:\/\//, '')
                : frame?.title || (studio ? 'Expand for live signed-in desk' : 'Show browser')}
            </button>
          )}
        </div>
  )

  const takeControlOverlay = assistantLocked ? (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/55 px-6 text-center"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <p className="max-w-xs text-[11px] text-gray-200">Assistant has the mouse</p>
      <button
        type="button"
        onClick={() => void run({ action: 'drive', youDrive: true })}
        className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg hover:bg-gray-100"
      >
        Take control
      </button>
    </div>
  ) : null

  const pageBody = expanded ? (
          <div className={`space-y-1 p-2 ${side ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : ''}`}>
            <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto">
              {HOMES.map((home) => (
                <button
                  key={home.label}
                  type="button"
                  disabled={busy || assistantLocked}
                  onClick={() => void run({ action: frame?.running ? 'navigate' : 'open', url: home.url })}
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${
                    hydrate && hydrateDeskLabel(hydrate) === home.label
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-100'
                      : studio
                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {home.label}
                </button>
              ))}
            </div>
            {hydrate ? (
              <div
                className="shrink-0 space-y-1.5 rounded border border-amber-700/50 bg-amber-950/40 px-2 py-1.5"
                data-testid="admin-browser-hydrate"
              >
                <p className="text-[11px] font-medium text-amber-100">
                  Hydrated from {hydrateSourceLabel(hydrate)}
                  {hydrate.releaseTitle ? ` · ${hydrate.releaseTitle}` : ''}
                </p>
                {hydrate.kind === 'distrokid' ? (
                  <>
                    <p className="text-[10px] text-amber-100/80">
                      {hydrate.windowLabel} · {hydrate.deskLabel} ·{' '}
                      {hydrate.target === 'my_music' ? 'My Music' : 'New upload'}
                      {hydrate.uploadBy ? ` · upload by ${hydrate.uploadBy}` : ''}
                      {hydrate.streetDate ? ` · street ${hydrate.streetDate}` : ''}
                    </p>
                    {hydrate.blockers.length > 0 ? (
                      <p className="text-[10px] text-amber-200/90">
                        Blockers: {hydrate.blockers.slice(0, 3).join(' · ')}
                        {hydrate.blockers.length > 3 ? '…' : ''}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-amber-100/80">
                      {hydrate.label} · {hydrate.channelLabel} · {hydrate.deskLabel}
                      {hydrate.asset ? ` · ${hydrate.asset}` : ''}
                    </p>
                    {hydrate.hint ? <p className="text-[10px] text-gray-400">{hydrate.hint}</p> : null}
                  </>
                )}
                {hydratePasteText(hydrate) ? (
                  <p className="max-h-16 overflow-y-auto whitespace-pre-wrap text-[10px] text-gray-300">
                    {hydratePasteText(hydrate)}
                  </p>
                ) : null}
                {hydrateNote ? <p className="text-[10px] text-amber-200/90">{hydrateNote}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy || !hydratePasteText(hydrate)}
                    onClick={() => void pasteHydratedText()}
                    className="rounded bg-amber-500 px-2 py-1 text-[10px] font-semibold text-black disabled:opacity-40"
                    title="Types into whatever field is focused in the browser. Click the field first."
                  >
                    {hydrate.kind === 'distrokid' ? 'Paste worksheet' : 'Paste caption'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !hydratePasteText(hydrate)}
                    onClick={() => {
                      const text = hydratePasteText(hydrate)
                      if (text) void navigator.clipboard.writeText(text)
                    }}
                    className="rounded border border-amber-700/60 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-900/40 disabled:opacity-40"
                  >
                    Copy again
                  </button>
                  {hydrate.kind === 'distrokid' && hydrate.target === 'upload' ? (
                    <>
                      <button
                        type="button"
                        data-testid="distrokid-desk-prefill"
                        disabled={busy}
                        onClick={() => void prefillDistroKidFromDesk()}
                        className="rounded border border-amber-500/70 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-900/40 disabled:opacity-40"
          title="Fill DistroKid /new/ from the Studio packet (fields + files). You QC and click Continue. Never submits."
                      >
                        {busy ? 'Filling…' : 'Fill form again'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void applyHydrate({
                            ...hydrate,
                            target: 'my_music',
                            url: DISTROKID_MY_MUSIC_URL,
                          })
                        }
                        className="rounded border border-amber-700/60 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-900/40 disabled:opacity-40"
                      >
                        Open My Music
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setHydrate(null)
                      setHydrateNote(null)
                    }}
                    className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
            {frame?.error ? <p className="shrink-0 text-[11px] text-amber-300">{frame.error}</p> : null}
            {frame?.imageBase64 ? (
              <div
                ref={surfaceRef}
                tabIndex={0}
                role="application"
                data-admin-browser-surface=""
                data-viewport-width={frame.width}
                data-viewport-height={frame.height}
                aria-label="Browser page. Scroll, click, and type here."
                onPointerDown={(event) => onPointer(event, 'down')}
                onPointerMove={(event) => onPointer(event, 'move')}
                onPointerUp={(event) => onPointer(event, 'up')}
                onKeyDown={onKeyDown}
                className={`relative w-full cursor-default overflow-hidden rounded border bg-black outline-none focus:ring-1 focus:ring-amber-500/70 ${
                  studio ? 'border-zinc-800' : 'border-gray-800'
                } ${side ? 'min-h-0 flex-1' : ''}`}
                style={side ? undefined : { height: pageHeight }}
              >
                {/* Live Chromium picture. The site itself cannot be embedded; input goes to that Chromium. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${frame.imageBase64}`}
                  alt={frame.title || 'Admin browser page'}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain object-top"
                />
                {takeControlOverlay}
              </div>
            ) : (
              <div
                ref={surfaceRef}
                className={`relative px-1 py-6 text-center text-[11px] text-gray-500 ${side ? 'flex min-h-0 flex-1 items-center justify-center' : ''}`}
              >
                {busy ? 'Starting Chromium…' : 'Blank until you pick a shortcut or enter an address. Sign-in stays in the Chromium profile on this Mac.'}
                {takeControlOverlay}
              </div>
            )}
            {frame?.title ? <p className="shrink-0 truncate text-[10px] text-gray-500">{frame.title}</p> : null}
            {taskNotice ? (
              <p className="shrink-0 text-[10px] leading-snug text-amber-200/95">{taskNotice}</p>
            ) : null}
          </div>
        ) : null

  if (side) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-gray-950">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-900">
          {chrome}
          {pageBody}
        </div>
      </div>
    )
  }

  if (studio) {
    return (
      <div
        className="overflow-hidden rounded-b-xl border border-t-0 border-zinc-800 bg-zinc-950/80"
        data-testid="studio-admin-browser-mirror"
      >
        <div className="overflow-hidden rounded-b-xl border border-transparent bg-zinc-900/50">
          {chrome}
          {pageBody}
          {expanded ? (
            <button
              type="button"
              aria-label="Resize browser mirror"
              title="Drag to resize"
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeUp}
              className="flex h-3 w-full cursor-ns-resize items-center justify-center border-t border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <span className="h-0.5 w-10 rounded-full bg-current" />
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-b border-gray-800 bg-gray-950 px-3 py-2">
      <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
        {chrome}
        {pageBody}
        {expanded ? (
          <button
            type="button"
            aria-label="Resize browser"
            title="Drag to resize the browser"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            className="flex h-3 w-full cursor-ns-resize items-center justify-center border-t border-gray-800 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          >
            <span className="h-0.5 w-10 rounded-full bg-current" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
