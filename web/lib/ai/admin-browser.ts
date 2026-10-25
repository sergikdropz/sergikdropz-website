/**
 * Local Chromium for the admin assistant.
 * The profile stays on this machine. Vercel does not launch it.
 * The assistant can act only when You drive is off.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  ADMIN_BROWSER_STUDIO_CHAT_ID,
  ADMIN_BROWSER_VIEWPORT,
  assistantMayRunBrowserAction,
  ADMIN_BROWSER_READ_ONLY_ACTIONS,
  normalizeAdminBrowserChatId,
  parseBrowserUrl,
  scaleWheel,
  stepZoom,
  viewportPoint,
  type AdminBrowserRequest,
  type AdminBrowserSnapshot,
} from '@/lib/ai/admin-browser-shared'
import { firstPartyWorkspaceFromUrl } from '@/lib/ai/first-party-workspace'
import {
  elementPickLabelFromParts,
  formatElementPickSource,
  normalizeElementPickSource,
} from '@/lib/ai/admin-ai-element-pick'
import {
  prefillDistroKidPage,
  type DistroKidPrefillPacket,
} from '@/lib/ai/distrokid-prefill'
import { uploadDistroKidAssets } from '@/lib/ai/distrokid-asset-upload'
import { readDistroKidBankCsv } from '@/lib/ai/distrokid-bank-import'
import { runMetaEarningsPull } from '@/lib/meta/earnings-desk'
import { ingestRoyaltyStatement, readRoyaltyStore, writeRoyaltyStore } from '@/lib/studio/royalties'
import { loadTrackSplitLookup } from '@/lib/studio/royalties/track-lookup'
import { stageSoundCloudFiles, uploadSoundCloudAssets, type StagedSoundCloudFiles } from '@/lib/ai/soundcloud-asset-upload'
import { prefillSoundCloudPage } from '@/lib/ai/soundcloud-prefill'
import { loadSoundCloudUploadPacket } from '@/lib/ai/soundcloud-upload-server'
import { normalizeSoundCloudPacket, SOUNDCLOUD_UPLOAD_URL, type SoundCloudUploadPacket } from '@/lib/ai/soundcloud-upload'
import {
  distrokidCodesFromHtml,
  distrokidPageKind,
  formatDistroKidPageCodes,
  type DistroKidPageCodes,
} from '@/lib/ai/distrokid-page-codes'

const KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'PageDown',
  'PageUp',
  'Delete',
  'Home',
  'End',
  'Space',
])

type BrowserPageLike = {
  goto: (url: string, opts?: { waitUntil?: 'domcontentloaded'; timeout?: number }) => Promise<unknown>
  screenshot: (opts: { type: 'jpeg'; quality: number }) => Promise<Buffer>
  keyboard: { type: (text: string) => Promise<void>; press: (key: string) => Promise<void> }
  mouse: {
    click: (x: number, y: number) => Promise<void>
    move: (x: number, y: number) => Promise<void>
    down: () => Promise<void>
    up: () => Promise<void>
    wheel: (deltaX: number, deltaY: number) => Promise<void>
  }
  goBack: (opts?: { timeout?: number }) => Promise<unknown>
  reload: (opts?: { waitUntil?: 'domcontentloaded'; timeout?: number }) => Promise<unknown>
  url: () => string
  title: () => Promise<string>
  isClosed: () => boolean
  close: () => Promise<void>
  setViewportSize: (size: { width: number; height: number }) => Promise<void>
  evaluate: <R>(fn: (...args: any[]) => R, ...args: any[]) => Promise<R>
  waitForTimeout?: (ms: number) => Promise<void>
  setInputFiles?: (selector: string, files: string | string[]) => Promise<void>
  locator?: (selector: string) => { setInputFiles: (files: string | string[]) => Promise<void> }
}

type BrowserContextLike = {
  pages: () => BrowserPageLike[]
  newPage: () => Promise<BrowserPageLike>
  close: () => Promise<void>
  newCDPSession: (page: BrowserPageLike) => Promise<CdpSession>
  addInitScript?: (fn: () => void) => Promise<void>
}

type PageSlot = {
  page: BrowserPageLike | null
  youDrive: boolean
  latestFrame: string | null
  screencastStarted: boolean
  cdp: CdpSession | null
  viewport: { width: number; height: number }
  zoom: number
  lastUsed: number
}

type BrowserRoot = {
  queue: Promise<void>
  context: BrowserContextLike | null
  launchMode: 'chrome' | 'chromium' | null
  slots: Map<string, PageSlot>
}

/** Page fields for the chat currently inside the lock. Context is shared. */
type Holder = {
  queue: Promise<void>
  context: BrowserContextLike | null
  youDrive: boolean
  latestFrame: string | null
  screencastStarted: boolean
  cdp: CdpSession | null
  viewport: { width: number; height: number }
  zoom: number
  launchMode: 'chrome' | 'chromium' | null
}

const MAX_CHAT_PAGES = 6
let activeRoot: BrowserRoot | null = null
let activeSlot: PageSlot | null = null

function freshSlot(): PageSlot {
  return {
    page: null,
    youDrive: true,
    latestFrame: null,
    screencastStarted: false,
    cdp: null,
    viewport: { ...ADMIN_BROWSER_VIEWPORT },
    zoom: 1,
    lastUsed: Date.now(),
  }
}

function viewOf(root: BrowserRoot, slot: PageSlot): Holder {
  return {
    get queue() {
      return root.queue
    },
    set queue(value) {
      root.queue = value
    },
    get context() {
      return root.context
    },
    set context(value) {
      root.context = value
    },
    get launchMode() {
      return root.launchMode
    },
    set launchMode(value) {
      root.launchMode = value
    },
    get youDrive() {
      return slot.youDrive
    },
    set youDrive(value) {
      slot.youDrive = value
    },
    get latestFrame() {
      return slot.latestFrame
    },
    set latestFrame(value) {
      slot.latestFrame = value
    },
    get screencastStarted() {
      return slot.screencastStarted
    },
    set screencastStarted(value) {
      slot.screencastStarted = value
    },
    get cdp() {
      return slot.cdp
    },
    set cdp(value) {
      slot.cdp = value
    },
    get viewport() {
      return slot.viewport
    },
    set viewport(value) {
      slot.viewport = value
    },
    get zoom() {
      return slot.zoom
    },
    set zoom(value) {
      slot.zoom = value
    },
  }
}

type CdpSession = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  on: (event: string, cb: (payload: { data: string; sessionId: number }) => void) => void
}

function holder(): BrowserRoot {
  const g = globalThis as {
    __sergikAdminBrowser?: BrowserRoot & {
      youDrive?: boolean
      latestFrame?: string | null
      screencastStarted?: boolean
      cdp?: CdpSession | null
      viewport?: { width: number; height: number }
      zoom?: number
    }
  }
  if (!g.__sergikAdminBrowser) {
    g.__sergikAdminBrowser = {
      queue: Promise.resolve(),
      context: null,
      launchMode: null,
      slots: new Map(),
    }
  }
  const root = g.__sergikAdminBrowser
  if (!root.queue) root.queue = Promise.resolve()
  if (!root.slots) {
    root.slots = new Map()
    const legacyPage = root.context?.pages().find((page) => !page.isClosed()) ?? null
    if (legacyPage) {
      root.slots.set('__legacy__', {
        page: legacyPage,
        youDrive: root.youDrive ?? true,
        latestFrame: root.latestFrame ?? null,
        screencastStarted: Boolean(root.screencastStarted),
        cdp: root.cdp ?? null,
        viewport: root.viewport ? { ...root.viewport } : { ...ADMIN_BROWSER_VIEWPORT },
        zoom: typeof root.zoom === 'number' ? root.zoom : 1,
        lastUsed: Date.now(),
      })
    }
  }
  return root
}

function ownedPages(root: BrowserRoot, except?: PageSlot): Set<BrowserPageLike> {
  const owned = new Set<BrowserPageLike>()
  for (const slot of root.slots.values()) {
    if (slot === except) continue
    if (slot.page && !slot.page.isClosed()) owned.add(slot.page)
  }
  return owned
}

function claimSlot(root: BrowserRoot, chatId: string): PageSlot {
  let slot = root.slots.get(chatId)
  if (!slot) {
    slot = freshSlot()
    root.slots.set(chatId, slot)
  }
  slot.lastUsed = Date.now()
  if ((!slot.page || slot.page.isClosed()) && chatId !== ADMIN_BROWSER_STUDIO_CHAT_ID) {
    const legacy = root.slots.get('__legacy__')
    if (legacy?.page && !legacy.page.isClosed()) {
      slot.page = legacy.page
      slot.youDrive = legacy.youDrive
      slot.latestFrame = legacy.latestFrame
      slot.screencastStarted = legacy.screencastStarted
      slot.cdp = legacy.cdp
      slot.viewport = legacy.viewport
      slot.zoom = legacy.zoom
      root.slots.delete('__legacy__')
    }
  }
  return slot
}

async function releaseSlot(root: BrowserRoot, chatId: string) {
  const slot = root.slots.get(chatId)
  if (!slot) return
  if (slot.cdp) await slot.cdp.send('Page.stopScreencast').catch(() => undefined)
  if (slot.page && !slot.page.isClosed()) await slot.page.close().catch(() => undefined)
  root.slots.delete(chatId)
}

async function evictOldPages(root: BrowserRoot, keep: PageSlot) {
  const open = [...root.slots.entries()].filter(([, slot]) => slot.page && !slot.page.isClosed() && slot !== keep)
  if (open.length < MAX_CHAT_PAGES) return
  open.sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  const [id, slot] = open[0]
  if (slot.cdp) await slot.cdp.send('Page.stopScreencast').catch(() => undefined)
  if (slot.page && !slot.page.isClosed()) await slot.page.close().catch(() => undefined)
  slot.page = null
  slot.cdp = null
  slot.screencastStarted = false
  slot.latestFrame = null
  if (id === '__legacy__') root.slots.delete(id)
}

function withLock<T>(chatId: string, fn: (state: Holder) => Promise<T>): Promise<T> {
  const root = holder()
  const run = root.queue.then(async () => {
    const slot = claimSlot(root, chatId)
    activeRoot = root
    activeSlot = slot
    try {
      return await fn(viewOf(root, slot))
    } finally {
      activeRoot = null
      activeSlot = null
    }
  })
  root.queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function currentPage(): BrowserPageLike | undefined {
  const page = activeSlot?.page
  if (page && !page.isClosed()) return page
  return undefined
}

export function adminBrowserHostAllowed(): { ok: true } | { ok: false; reason: string } {
  if (process.env.VERCEL) {
    return { ok: false, reason: 'The admin browser runs on the Mac that is hosting this dev server.' }
  }
  return { ok: true }
}

function profileDir(channel: 'chrome' | 'chromium') {
  const cwd = process.cwd()
  const root = fs.existsSync(path.join(cwd, 'playwright.config.ts')) ? cwd : path.join(cwd, 'web')
  const folder = channel === 'chrome' ? 'admin-browser-chrome-profile' : 'admin-browser-profile'
  return path.join(root, '.dev', folder)
}

async function loadChromium() {
  const mod = (await import(/* webpackIgnore: true */ 'playwright')) as unknown as {
    chromium: {
      launchPersistentContext: (dir: string, options: Record<string, unknown>) => Promise<BrowserContextLike>
    }
  }
  return mod.chromium
}

async function closeContext(state: Holder) {
  if (!state.context) return
  await state.context.close().catch(() => undefined)
  state.context = null
  state.cdp = null
  state.screencastStarted = false
  state.latestFrame = null
  state.launchMode = null
  if (activeRoot) {
    for (const slot of activeRoot.slots.values()) {
      slot.page = null
      slot.cdp = null
      slot.screencastStarted = false
      slot.latestFrame = null
    }
  }
}

async function ensureContext(state: Holder): Promise<BrowserContextLike> {
  if (state.context && state.launchMode === 'chrome') return state.context
  if (state.context) await closeContext(state)
  const chromium = await loadChromium()
  const launchOptions = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: state.viewport,
    locale: 'en-US',
    args: ['--disable-blink-features=AutomationControlled', '--window-position=80,80'],
  }
  const chromeDir = profileDir('chrome')
  fs.mkdirSync(chromeDir, { recursive: true })
  try {
    state.context = await chromium.launchPersistentContext(chromeDir, {
      ...launchOptions,
      channel: 'chrome',
    })
    state.launchMode = 'chrome'
  } catch {
    const fallbackDir = profileDir('chromium')
    fs.mkdirSync(fallbackDir, { recursive: true })
    state.context = await chromium.launchPersistentContext(fallbackDir, launchOptions)
    state.launchMode = 'chromium'
  }
  if (state.context.addInitScript) {
    await state.context
      .addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })
      .catch(() => undefined)
  }
  return state.context
}

async function ensurePage(context: BrowserContextLike): Promise<BrowserPageLike> {
  const slot = activeSlot
  if (slot?.page && !slot.page.isClosed()) return slot.page
  const owned = activeRoot ? ownedPages(activeRoot, slot ?? undefined) : new Set<BrowserPageLike>()
  const blank = context.pages().find((page) => !page.isClosed() && !owned.has(page) && page.url() === 'about:blank')
  const page = blank ?? (await context.newPage())
  if (slot) slot.page = page
  if (activeRoot && slot) await evictOldPages(activeRoot, slot)
  return page
}

async function focusScreencast(state: Holder, page: BrowserPageLike) {
  if (activeRoot) {
    for (const slot of activeRoot.slots.values()) {
      if (slot === activeSlot) continue
      if (!slot.cdp) continue
      await slot.cdp.send('Page.stopScreencast').catch(() => undefined)
      slot.cdp = null
      slot.screencastStarted = false
    }
  }
  if (!state.context || state.screencastStarted) return
  await startScreencast(state, state.context, page).catch(() => undefined)
}

async function startScreencast(state: Holder, context: BrowserContextLike, page: BrowserPageLike) {
  if (state.screencastStarted) return
  const session = await context.newCDPSession(page)
  state.cdp = session
  await session.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 55,
    maxWidth: state.viewport.width,
    maxHeight: state.viewport.height,
    everyNthFrame: 1,
  })
  session.on('Page.screencastFrame', (event) => {
    state.latestFrame = event.data
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined)
  })
  state.screencastStarted = true
}

function clampViewport(width: number, height: number) {
  return {
    width: Math.round(Math.min(1600, Math.max(320, width))),
    height: Math.round(Math.min(1800, Math.max(160, height))),
  }
}

async function applyPageZoom(page: BrowserPageLike, zoom: number) {
  const factor = stepZoom(zoom, 0)
  await page
    .evaluate((value) => {
      document.documentElement.style.zoom = String(value)
    }, factor)
    .catch(() => undefined)
}

async function applyViewport(state: Holder, context: BrowserContextLike, page: BrowserPageLike, width: number, height: number) {
  const next = clampViewport(width, height)
  if (
    Math.abs(next.width - state.viewport.width) < 16 &&
    Math.abs(next.height - state.viewport.height) < 16
  ) {
    return
  }
  state.viewport = next
  await page.setViewportSize(next)
  if (state.cdp) {
    await state.cdp.send('Page.stopScreencast').catch(() => undefined)
  }
  state.cdp = null
  state.screencastStarted = false
  state.latestFrame = null
  await startScreencast(state, context, page)
  if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
}

function pointer(request: AdminBrowserRequest, viewport: { width: number; height: number }) {
  if (typeof request.x !== 'number' || typeof request.y !== 'number') return null
  return viewportPoint(request.x, request.y, viewport.width, viewport.height)
}

/** Runs inside the live browser page. Must stay free of Node closures. */
function readPageOutline() {
  document.querySelectorAll('[data-admin-ai-target]').forEach((node) => {
    node.removeAttribute('data-admin-ai-target')
  })
  const out: Array<{
    id: string
    role: string
    name: string
    value: string
    x?: number
    y?: number
    w?: number
    h?: number
    disabled?: boolean
    [key: string]: unknown
  }> = []
  const nodes = document.querySelectorAll(
    'h1,h2,h3,a,button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[role="option"],[role="listbox"]',
  )
  for (const el of Array.from(nodes)) {
    if (out.length >= 60) break
    const style = window.getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) continue
    const input = el as HTMLInputElement
    if (input.type === 'hidden' || input.type === 'password') continue
    const role = el.getAttribute('role') || el.tagName.toLowerCase()
    const name = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el as HTMLElement).innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90)
    const value = 'value' in el ? String(input.value || '').slice(0, 80) : ''
    if (!name && !value) continue
    const id = `c${out.length + 1}`
    el.setAttribute('data-admin-ai-target', id)
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    out.push({
      id,
      role,
      name,
      value,
      x: Math.round((cx / window.innerWidth) * 1000) / 1000,
      y: Math.round((cy / window.innerHeight) * 1000) / 1000,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      disabled: Boolean(input.disabled || el.getAttribute('aria-disabled') === 'true'),
      readOnly: Boolean(input.readOnly),
      active: document.activeElement === el,
    })
  }
  return out
}

/** Runs inside the live browser page. Must stay free of Node closures. */
function readElementAtPoint(point: { x: number; y: number }) {
  const x = point.x
  const y = point.y

  function describe(el: Element) {
    const attrs: Array<{ name: string; value: string }> = []
    for (const attr of Array.from(el.attributes)) {
      if (attrs.length >= 40) break
      attrs.push({ name: attr.name, value: attr.value.slice(0, 220) })
    }
    const ancestors: Array<{ tag: string; id: string; className: string }> = []
    let node = el.parentElement
    let depth = 0
    while (node && node !== document.body && node !== document.documentElement && depth < 16) {
      ancestors.unshift({
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        className: node.getAttribute('class') || '',
      })
      node = node.parentElement
      depth += 1
    }
    const rect = el.getBoundingClientRect()
    const text = ((el instanceof HTMLElement ? el.innerText : '') || el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220)
    let associatedLabel = ''
    if (el.id) {
      try {
        const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        if (byFor) associatedLabel = (byFor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      } catch {
        /* ignore */
      }
    }
    if (!associatedLabel) {
      const parentLabel = el.closest('label')
      if (parentLabel) {
        associatedLabel = (parentLabel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      }
    }
    const input = el as HTMLInputElement
    const hasValue = 'value' in el && typeof input.value === 'string'
    const style = window.getComputedStyle(el)
    const border = `${style.borderTopColor || ''} ${style.outlineColor || ''}`
    const invalid =
      input.getAttribute?.('aria-invalid') === 'true' ||
      /error|invalid|required|danger|\bred\b/i.test(`${el.className}`) ||
      /rgb\(\s*(1[89]\d|2[0-2]\d|230)\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/i.test(border)
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: el.getAttribute('class') || '',
      ancestors,
      attrs,
      text,
      childElementCount: el.childElementCount,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      value: hasValue ? String(input.value || '').slice(0, 160) : '',
      checked:
        el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')
          ? el.checked
          : undefined,
      required: Boolean(input.required || input.getAttribute?.('aria-required') === 'true'),
      invalid: Boolean(invalid),
      associatedLabel,
    }
  }

  let el: Element | null = document.elementFromPoint(x, y)
  for (let i = 0; el && i < 5; i += 1) {
    if (el instanceof HTMLIFrameElement && el.contentDocument) {
      const rect = el.getBoundingClientRect()
      const next = el.contentDocument.elementFromPoint(x - rect.left, y - rect.top)
      if (!next || next === el.contentDocument.documentElement || next === el.contentDocument.body) break
      el = next
      continue
    }
    const root = el.shadowRoot
    if (root) {
      const next = root.elementFromPoint(x, y)
      if (!next || next === el) break
      el = next
      continue
    }
    break
  }
  if (!el || el === document.documentElement || el === document.body) return null
  return describe(el)
}

function distrokidSubmitLabel(label: string): boolean {
  return /\b(submit|continue|done|finish|checkout|pay now|upload album)\b/i.test(label)
}

async function locateControl(
  page: BrowserPageLike,
  query: string,
  mode: 'click' | 'field',
): Promise<{ x: number; y: number; label: string } | null> {
  return page.evaluate(
    (input: { query: string; mode: 'click' | 'field' }) => {
      const q = input.query.trim().toLowerCase()
      if (!q) return null
      if (/^c\d+$/.test(q)) {
        const marked = document.querySelector(`[data-admin-ai-target="${q}"]`)
        if (marked) {
          const rect = marked.getBoundingClientRect()
          if (rect.width >= 2 && rect.height >= 2) {
            const x = rect.left + rect.width / 2
            const y = rect.top + rect.height / 2
            if (input.mode === 'field' && (marked instanceof HTMLInputElement || marked instanceof HTMLTextAreaElement)) {
              marked.focus()
              marked.select()
            }
            const label = (
              marked.getAttribute('aria-label') ||
              marked.getAttribute('placeholder') ||
              (marked as HTMLElement).innerText ||
              q
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80)
            return { x, y, label: label || q }
          }
        }
      }
      const selector =
        input.mode === 'field'
          ? 'input, textarea, select, [contenteditable="true"]'
          : 'a, button, input, textarea, select, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"]'
      const nodes = Array.from(document.querySelectorAll(selector))
      let best: { x: number; y: number; label: string; score: number } | null = null
      for (const el of nodes) {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) continue
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        const aria = (el.getAttribute('aria-label') || '').toLowerCase()
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase()
        const name = (el.getAttribute('name') || '').toLowerCase()
        const id = (el.id || '').toLowerCase()
        let labelText = ''
        if (el.id) {
          const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
          if (byFor) labelText = (byFor.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        }
        const blob = `${text} ${aria} ${placeholder} ${name} ${id} ${labelText}`
        let score = 0
        if (text === q || aria === q || placeholder === q || labelText === q || name === q) score = 3
        else if (blob.includes(q)) score = 2
        if (score < 2) continue
        if (!best || score > best.score) {
          best = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            label: (aria || labelText || text || placeholder || name).slice(0, 80),
            score,
          }
        }
      }
      if (!best) return null
      const chosen = best
      if (input.mode === 'field') {
        const node = document.elementFromPoint(chosen.x, chosen.y) as HTMLElement | null
        const field =
          node?.closest?.('input, textarea, select, [contenteditable="true"]') ||
          (node?.matches?.('input, textarea, select, [contenteditable="true"]') ? node : null)
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.select()
      }
      return { x: chosen.x, y: chosen.y, label: chosen.label }
    },
    { query, mode },
  )
}

async function frame(
  page: BrowserPageLike,
  opts: { image: boolean; text: boolean }
): Promise<Pick<AdminBrowserSnapshot, 'url' | 'title' | 'text' | 'imageBase64'>> {
  const url = page.url()
  const title = await page.title().catch(() => '')
    const text = opts.text
    ? await page
        .evaluate(() => (document.body?.innerText || '').replace(/\s+\n/g, '\n').trim().slice(0, 8000))
        .catch(() => '')
    : undefined
  const imageBase64 = opts.image ? (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64') : undefined
  return { url, title, text, imageBase64 }
}

function emptySnapshot(partial: Partial<AdminBrowserSnapshot>, viewport = ADMIN_BROWSER_VIEWPORT): AdminBrowserSnapshot {
  return {
    ok: partial.ok ?? true,
    enabled: partial.enabled ?? true,
    running: partial.running ?? false,
    youDrive: partial.youDrive ?? true,
    url: partial.url ?? '',
    title: partial.title ?? '',
    text: partial.text,
    error: partial.error,
    distrokidCodes: partial.distrokidCodes,
    imageBase64: partial.imageBase64,
    width: partial.width ?? viewport.width,
    height: partial.height ?? viewport.height,
  }
}

function describeAction(request: AdminBrowserRequest): string {
  switch (request.action) {
    case 'navigate':
    case 'open':
      return parseBrowserUrl(request.url)
        ? `Would open ${parseBrowserUrl(request.url)}.`
        : 'Would stay blank until an address is assigned.'
    case 'click':
    case 'pointer':
      return 'Would point at the open page.'
    case 'wheel':
      return 'Would scroll the open page.'
    case 'viewport':
      return 'Would show more of the page.'
    case 'zoom':
      return 'Would change the page zoom.'
    case 'type':
      return 'Would type into the open page.'
    case 'press':
      return `Would press ${request.key || 'a key'}.`
    case 'back':
      return 'Would go back.'
    case 'reload':
      return 'Would reload the page.'
    case 'read':
      return 'Would read the open page.'
    case 'snapshot':
      return 'Would list controls on the open page.'
    case 'drive':
      return request.youDrive === false ? 'Would hand the browser to the assistant.' : 'Would keep you driving.'
    case 'distrokid_prefill':
      return 'Would prefill DistroKid /new/ from the Release Studio packet (no submit).'
    case 'distrokid_upload_assets':
      return 'Would upload DSP artwork + WAV masters into the open DistroKid /new/ form.'
    case 'distrokid_bank_import':
      return 'Would read a DistroKid bank CSV link and ingest it. Does not click Continue, Submit, or Let\'s do it.'
    case 'meta_earnings_pull':
      return 'Would pull Meta ad spend and Facebook creator earnings through the Graph API.'
    case 'soundcloud_prefill':
      return 'Would attach this release’s database audio and artwork on SoundCloud upload, then fill the EP. Never clicks Save.'
    case 'probe_fields':
      return 'Would list visible form fields on the open page.'
    case 'inspect':
      return 'Would identify the element under the pointer in the open page.'
    default:
      return 'Would check the browser.'
  }
}

function normalizeDistroKidPacket(raw: Record<string, unknown> | undefined): DistroKidPrefillPacket | null {
  if (!raw || typeof raw !== 'object') return null
  const releaseRaw = raw.release
  const tracksRaw = raw.tracks
  if (!releaseRaw || typeof releaseRaw !== 'object' || !Array.isArray(tracksRaw)) return null
  const release = releaseRaw as Record<string, unknown>
  const storesRaw = release.stores
  return {
    release: {
      previously_released: Boolean(release.previously_released),
      artist: String(release.artist || '').trim(),
      label: String(release.label || '').trim(),
      title: String(release.title || '').trim(),
      language: String(release.language || '').trim(),
      primary_genre: String(release.primary_genre || '').trim(),
      secondary_genre: String(release.secondary_genre || '').trim(),
      release_date: String(release.release_date || '').trim(),
      upc: String(release.upc || '').trim(),
      artwork_url: String(release.artwork_url || '').trim(),
      stores: Array.isArray(storesRaw)
        ? storesRaw.map((s) => String(s || '').trim()).filter(Boolean)
        : [],
    },
    tracks: tracksRaw.map((row, index) => {
      const track = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
      const previewRaw = Number(track.preview_start_seconds)
      return {
        track_number: Number(track.track_number) || index + 1,
        title: String(track.title || '').trim(),
        artist: String(track.artist || '').trim(),
        featuring: String(track.featuring || '').trim(),
        songwriters: String(track.songwriters || '').trim(),
        isrc: String(track.isrc || '').trim().replace(/-/g, '').toUpperCase(),
        explicit: Boolean(track.explicit),
        instrumental: Boolean(track.instrumental),
        ai_generated: Boolean(track.ai_generated),
        wav_url: String(track.wav_url || '').trim(),
        preview_start_seconds:
          Number.isFinite(previewRaw) && previewRaw >= 0 ? Math.round(previewRaw) : null,
        apple_performer_name: String(track.apple_performer_name || '').trim(),
        apple_performer_instrument: String(track.apple_performer_instrument || 'Drum Machine').trim(),
        apple_producer_name: String(track.apple_producer_name || '').trim(),
      }
    }),
  }
}

export async function runAdminBrowserAction(request: AdminBrowserRequest): Promise<AdminBrowserSnapshot> {
  const host = adminBrowserHostAllowed()
  if (!host.ok) {
    return emptySnapshot({ ok: false, enabled: false, error: host.reason, youDrive: true })
  }

  const chatId = normalizeAdminBrowserChatId(request.chatSessionId)
  if (request.action === 'release') {
    const root = holder()
    const run = root.queue.then(() => releaseSlot(root, chatId))
    root.queue = run.then(
      () => undefined,
      () => undefined
    )
    await run
    return emptySnapshot({ running: false, youDrive: true })
  }

  let soundcloudPrepared: { packet: SoundCloudUploadPacket; staged: StagedSoundCloudFiles } | null = null
  if (request.action === 'soundcloud_prefill' && !request.dryRun) {
    let packet = normalizeSoundCloudPacket(request.soundcloudPacket)
    if (!packet && request.releaseId) {
      const loaded = await loadSoundCloudUploadPacket(request.releaseId)
      if (!loaded.packet) {
        return emptySnapshot({
          ok: false,
          running: true,
          youDrive: true,
          error: loaded.error || 'Could not read this release’s files from the database.',
        })
      }
      packet = loaded.packet
    }
    if (!packet) {
      return emptySnapshot({
        ok: false,
        running: true,
        youDrive: true,
        error: 'SoundCloud upload needs the open release so it can read audio files from the database.',
      })
    }
    if (!packet.ok) {
      return emptySnapshot({
        ok: false,
        running: true,
        youDrive: true,
        error: packet.blockers[0] || 'Database file URLs are missing for this release.',
        text: packet.blockers.join('\n'),
      })
    }
    soundcloudPrepared = { packet, staged: await stageSoundCloudFiles(packet) }
  }

  return withLock(chatId, async (state) => {
    try {
    if (state.context && state.launchMode !== 'chrome') {
      const current = currentPage()?.url()
      await closeContext(state)
      const context = await ensureContext(state)
      if (current && current !== 'about:blank') {
        const page = await ensurePage(context)
        await page.goto(current, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
        await startScreencast(state, context, page).catch(() => undefined)
      }
    }

    if (request.action === 'status' || request.action === 'frame') {
      const page = currentPage()
      if (page) await focusScreencast(state, page)
      const image =
        request.includeImage
          ? state.latestFrame ||
            (page ? (await page.screenshot({ type: 'jpeg', quality: 55 })).toString('base64') : undefined)
          : undefined
      return emptySnapshot(
        {
          running: Boolean(page),
          youDrive: state.youDrive,
          url: page?.url() ?? '',
          title: request.action === 'frame' ? '' : page ? await page.title().catch(() => '') : '',
          imageBase64: image,
        },
        state.viewport,
      )
    }

    if (request.action === 'snapshot') {
      const page = currentPage()
      if (!page) {
        return emptySnapshot({ running: false, youDrive: state.youDrive, text: 'Browser is not open.' })
      }
      const blocked = firstPartyWorkspaceFromUrl(page.url())
      if (blocked) {
        return emptySnapshot({
          ok: true,
          running: true,
          youDrive: state.youDrive,
          url: blocked.href,
          title: blocked.releaseId ? 'Release Studio' : 'Admin',
          text: blocked.message,
        })
      }
      const outline = await page.evaluate(readPageOutline).catch(() => [])
      const shot = await frame(page, { image: Boolean(request.includeImage), text: true })
      return {
        ...emptySnapshot({
          running: true,
          youDrive: state.youDrive,
          url: shot.url,
          title: shot.title,
          text: shot.text,
          imageBase64: shot.imageBase64,
        }),
        pageOutline: Array.isArray(outline) ? outline : [],
      }
    }

    if (request.action === 'open' || request.action === 'navigate') {
      const workspace = firstPartyWorkspaceFromUrl(request.url)
      if (workspace) {
        return emptySnapshot({
          ok: true,
          running: Boolean(state.context),
          youDrive: state.youDrive,
          url: workspace.href,
          title: workspace.releaseId ? 'Release Studio' : 'Admin',
          text: workspace.message,
        })
      }
    }

    const openPage = currentPage()
    let openUrl = ''
    try {
      openUrl = openPage?.url() || ''
    } catch {
      openUrl = ''
    }
    const stuckOnOurAdmin = firstPartyWorkspaceFromUrl(openUrl)
    if (
      stuckOnOurAdmin &&
      request.action !== 'drive' &&
      request.action !== 'open' &&
      request.action !== 'navigate' &&
      request.action !== 'back'
    ) {
      return emptySnapshot({
        ok: true,
        running: true,
        youDrive: state.youDrive,
        url: openUrl,
        title: 'Admin',
        text: stuckOnOurAdmin.message,
      })
    }

    if (!assistantMayRunBrowserAction(state.youDrive, request.actor, request.action)) {
      return emptySnapshot({
        ok: false,
        running: Boolean(state.context),
        youDrive: true,
        error: 'You are driving this browser. Turn off You drive before the assistant clicks or types.',
      })
    }

    if (
      request.dryRun &&
      !ADMIN_BROWSER_READ_ONLY_ACTIONS.has(request.action)
    ) {
      return emptySnapshot({
        running: Boolean(state.context),
        youDrive: state.youDrive,
        text: describeAction(request),
      })
    }

    if (request.action === 'drive') {
      state.youDrive = request.youDrive !== false
      const page = currentPage()
      const shot = page ? await frame(page, { image: Boolean(request.includeImage), text: false }) : null
      return emptySnapshot({
        running: Boolean(page),
        youDrive: state.youDrive,
        url: shot?.url ?? '',
        title: shot?.title ?? '',
        imageBase64: shot?.imageBase64,
      })
    }

    if (request.action === 'meta_earnings_pull') {
      const pulled = await runMetaEarningsPull()
      return {
        ...emptySnapshot({
          ok: pulled.ok,
          running: Boolean(currentPage()),
          youDrive: state.youDrive,
          url: 'https://business.facebook.com/',
          title: 'Meta',
          text: pulled.note,
          error: pulled.ok ? undefined : pulled.note,
        }),
        metaEarnings: pulled,
      }
    }

    const createsPage =
      request.action === 'open' ||
      request.action === 'navigate' ||
      request.action === 'distrokid_prefill' ||
      request.action === 'distrokid_upload_assets' ||
      request.action === 'distrokid_bank_import' ||
      request.action === 'soundcloud_prefill'
    if (!createsPage && !currentPage()) {
      return emptySnapshot({ running: false, youDrive: state.youDrive })
    }
    if ((request.action === 'open' || request.action === 'navigate') && !parseBrowserUrl(request.url)) {
      return emptySnapshot({
        ok: false,
        running: Boolean(currentPage()),
        youDrive: state.youDrive,
        error: 'Enter an http or https address.',
      })
    }

    let context: BrowserContextLike
    try {
      context = await ensureContext(state)
    } catch (error) {
      return emptySnapshot({
        ok: false,
        youDrive: state.youDrive,
        error: friendlyBrowserError(error),
      })
    }
    const page = await ensurePage(context)
    await focusScreencast(state, page)

    if (request.action === 'open' || request.action === 'navigate') {
      const target = parseBrowserUrl(request.url)
      if (!target) {
        return emptySnapshot({ ok: false, running: Boolean(currentPage()), youDrive: state.youDrive, error: 'Enter an http or https address.' })
      }
      const navErr = await safeGoto(page, target)
      if (navErr) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: navErr })
      }
      if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
    } else if (request.action === 'back') {
      await page.goBack({ timeout: 15_000 }).catch(() => undefined)
      if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
    } else if (request.action === 'reload') {
      const reloadErr = await page
        .reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
        .then(() => null)
        .catch((error: unknown) => friendlyBrowserError(error))
      if (reloadErr) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: reloadErr })
      }
      if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
    } else if (request.action === 'zoom') {
      state.zoom = stepZoom(request.zoom ?? state.zoom, 0)
      await applyPageZoom(page, state.zoom)
    } else if (request.action === 'viewport') {
      const width = request.viewportWidth ?? state.viewport.width
      const height = request.viewportHeight ?? state.viewport.height
      await applyViewport(state, context, page, width, height)
    } else if (request.action === 'click') {
      const named = request.target?.trim()
      const namedHit = named ? await locateControl(page, named, 'click') : null
      if (named && !namedHit) {
        return emptySnapshot(
          { ok: false, running: true, youDrive: state.youDrive, url: page.url(), error: `No visible control matching “${named}”.` },
          state.viewport,
        )
      }
      const point = namedHit
        ? { x: namedHit.x, y: namedHit.y }
        : typeof request.x === 'number' && typeof request.y === 'number'
          ? viewportPoint(request.x, request.y, state.viewport.width, state.viewport.height)
          : null
      if (!point) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: 'Click needs a target label, or x and y.' }, state.viewport)
      }
      if (request.actor === 'assistant' && /distrokid\.com/i.test(page.url())) {
        const namedBlocked = distrokidSubmitLabel(namedHit?.label || named || '')
        const blocked =
          namedBlocked ||
          ((await page.evaluate((p: { x: number; y: number }) => {
            const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null
            if (!el) return false
            const blob = [
              el.tagName,
              el.id,
              el.getAttribute('type') || '',
              el.getAttribute('name') || '',
              el.getAttribute('aria-label') || '',
              el.textContent || '',
            ]
              .join(' ')
              .replace(/\s+/g, ' ')
              .toLowerCase()
            return /\b(submit|continue|done|finish|checkout|pay now|upload album)\b/.test(blob)
          }, point)) as boolean)
        if (blocked) {
          return emptySnapshot({
            ok: false,
            running: true,
            youDrive: true,
            url: page.url(),
            error:
              'DistroKid Continue/Submit stays with you. Review the filled form, then click Continue yourself.',
          })
        }
      }
      await page.mouse.click(point.x, point.y)
    } else if (request.action === 'type') {
      const text = request.text?.slice(0, 2000) ?? ''
      if (!text) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: 'Nothing to type.' })
      }
      const field = request.target?.trim()
      if (field) {
        const focused = await locateControl(page, field, 'field')
        if (!focused) {
          return emptySnapshot({
            ok: false,
            running: true,
            youDrive: state.youDrive,
            url: page.url(),
            error: `No field matching “${field}”.`,
          })
        }
        await page.mouse.click(focused.x, focused.y)
      }
      await page.keyboard.type(text)
    } else if (request.action === 'wheel') {
      const point = pointer(request, state.viewport)
      if (point) await page.mouse.move(point.x, point.y)
      const deltaX = request.deltaX ?? 0
      const deltaY = request.deltaY ?? (request.deltaX == null ? 720 : 0)
      const scaled = scaleWheel(
        deltaX,
        deltaY,
        request.viewWidth ?? state.viewport.width,
        request.viewHeight ?? state.viewport.height,
        state.viewport.width,
        state.viewport.height,
      )
      await page.mouse.wheel(scaled.deltaX, scaled.deltaY)
    } else if (request.action === 'pointer') {
      const point = pointer(request, state.viewport)
      if (!point) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: 'Pointer needs x and y.' }, state.viewport)
      }
      await page.mouse.move(point.x, point.y)
      if (request.phase === 'down') await page.mouse.down()
      if (request.phase === 'up') await page.mouse.up()
    } else if (request.action === 'inspect') {
      const point = pointer(request, state.viewport)
      if (!point) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: 'Inspect needs x and y.' }, state.viewport)
      }
      const raw = await page.evaluate(readElementAtPoint as never, point as never)
      const source = normalizeElementPickSource(raw)
      if (!source) {
        return emptySnapshot({
          ok: false,
          running: true,
          youDrive: state.youDrive,
          url: page.url(),
          error: 'No element at that point in the browser.',
        })
      }
      const title = await page.title().catch(() => '')
      return {
        ...emptySnapshot({
          running: true,
          youDrive: state.youDrive,
          url: page.url(),
          title,
        }),
        elementPick: {
          text: formatElementPickSource(source, page.url(), { youDrive: state.youDrive }),
          label: elementPickLabelFromParts(source),
          top: source.top,
          left: source.left,
          width: source.width,
          height: source.height,
          viewportWidth: state.viewport.width,
          viewportHeight: state.viewport.height,
        },
      }
    } else if (request.action === 'press') {
      const key = request.key?.trim() ?? ''
      if (!KEYS.has(key)) {
        return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: 'That key is not available.' })
      }
      await page.keyboard.press(key)
    } else if (request.action === 'probe_fields') {
      const fields = (await page.evaluate(() => {
        const out: Array<{
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
        }> = []
        const nodes = Array.from(
          document.querySelectorAll('input, textarea, select')
        ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
        for (const el of nodes) {
          const style = window.getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          const hidden =
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            rect.width < 1 ||
            rect.height < 1
          // Still surface ISRC/UPC/hidden songwriter slots — DistroKid keeps many off-screen until toggled.
          const forceInclude = /isrc|upc|songwriter|albumtitle|tracks_\d+_artists/i.test(
            `${el.id} ${el.getAttribute('name') || ''} ${el.getAttribute('placeholder') || ''}`
          )
          if (hidden && !forceInclude) continue
          let label = ''
          if (el.id) {
            const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
            if (byFor) label = (byFor.textContent || '').trim()
          }
          if (!label) {
            const parentLabel = el.closest('label')
            if (parentLabel) label = (parentLabel.textContent || '').trim()
          }
          if (!label) {
            const prev = el.previousElementSibling
            if (prev) label = (prev.textContent || '').trim()
          }
          const input = el as HTMLInputElement
          const border = `${style.borderTopColor || ''} ${style.outlineColor || ''}`
          const invalid =
            input.getAttribute('aria-invalid') === 'true' ||
            /error|invalid|required|danger|\bred\b/i.test(`${el.className}`) ||
            /rgb\(\s*(1[89]\d|2[0-2]\d|230)\s*,\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/i.test(border)
          out.push({
            tag: el.tagName.toLowerCase(),
            type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
            name: el.getAttribute('name') || '',
            id: el.id || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: label.replace(/\s+/g, ' ').slice(0, 120),
            value: String(input.value || '').slice(0, 80),
            checked: el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? el.checked : undefined,
            required: Boolean(input.required || input.getAttribute('aria-required') === 'true'),
            invalid: Boolean(invalid),
          })
        }
        return out.slice(0, 300)
      })) as AdminBrowserSnapshot['fieldProbe']
      const shot = await frame(page, { image: Boolean(request.includeImage), text: false })
      return {
        ...emptySnapshot({
          running: true,
          youDrive: state.youDrive,
          url: shot.url,
          title: shot.title,
          text: `Found ${fields?.length || 0} visible fields.`,
          imageBase64: request.includeImage ? shot.imageBase64 : undefined,
        }),
        fieldProbe: fields,
      }
      } else if (request.action === 'distrokid_bank_import') {
      const read = await readDistroKidBankCsv(page)
      if (!read.csv) {
        const shot = await frame(page, { image: Boolean(request.includeImage), text: true })
        return {
          ...emptySnapshot({
            ok: false,
            running: true,
            youDrive: state.youDrive,
            url: shot.url,
            title: shot.title,
            text: read.note,
            error: read.note,
            imageBase64: request.includeImage ? shot.imageBase64 : undefined,
          }),
          distrokidBank: { status: read.status, lineCount: 0, duplicate: false, note: read.note },
        }
      }
      const [store, trackLookup] = await Promise.all([readRoyaltyStore(), loadTrackSplitLookup()])
      const ingested = ingestRoyaltyStatement({
        csvText: read.csv,
        filename: 'distrokid-bank.csv',
        notes: 'Pulled from the DistroKid bank desk. Amounts stored as reported.',
        externalKey: 'distrokid:bank',
        store,
        trackLookup,
      })
      if (!ingested.duplicate && ingested.lineCount > 0) await writeRoyaltyStore(ingested.store)
      if (ingested.lineCount === 0) {
        const shot = await frame(page, { image: Boolean(request.includeImage), text: false })
        const note = 'The bank page opened, but no earnings rows could be read. Download the CSV from DistroKid and ingest that file.'
        return {
          ...emptySnapshot({
            ok: false,
            running: true,
            youDrive: true,
            url: shot.url,
            title: shot.title,
            text: note,
            error: note,
            imageBase64: request.includeImage ? shot.imageBase64 : undefined,
          }),
          distrokidBank: { status: 'empty', lineCount: 0, duplicate: false, note },
        }
      }
      state.youDrive = true
      const shot = await frame(page, { image: Boolean(request.includeImage), text: false })
      const note = ingested.duplicate
        ? 'That bank file is already in the ledger.'
        : `Ingested ${ingested.lineCount} bank rows.`
      return {
        ...emptySnapshot({
          ok: true,
          running: true,
          youDrive: state.youDrive,
          url: shot.url,
          title: shot.title,
          text: note,
          imageBase64: request.includeImage ? shot.imageBase64 : undefined,
        }),
        distrokidBank: {
          status: read.status,
          lineCount: ingested.lineCount,
          duplicate: ingested.duplicate,
          note,
        },
      }
    } else if (
      request.action === 'distrokid_prefill' ||
      request.action === 'distrokid_upload_assets'
    ) {
      const packet = normalizeDistroKidPacket(request.distrokidPacket)
      if (!packet) {
        return emptySnapshot({
          ok: false,
          running: true,
          youDrive: state.youDrive,
          error: 'DistroKid action needs a packet with release + tracks.',
        })
      }
      if (!/distrokid\.com\/new/i.test(page.url())) {
        const navErr = await safeGoto(page, 'https://distrokid.com/new/')
        if (navErr) {
          return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: navErr })
        }
        if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
        await sleep(1500)
      }

      const assetsOnly = request.action === 'distrokid_upload_assets'
      const prefill = assetsOnly
        ? { filled: [] as string[], skipped: [] as string[], errors: [] as string[], ok: true, url: page.url() }
        : await prefillDistroKidPage(page, packet)

      let uploads = { filled: [] as string[], skipped: [] as string[], errors: [] as string[] }
      if (assetsOnly || !request.skipDistrokidAssets) {
        uploads = await uploadDistroKidAssets(page as never, packet)
      }

      const filled = Array.from(new Set([...prefill.filled, ...uploads.filled]))
      const skipped = Array.from(new Set([...prefill.skipped, ...uploads.skipped]))
      const errors = Array.from(new Set([...prefill.errors, ...uploads.errors]))
      state.youDrive = true
      const shot = await frame(page, {
        image: Boolean(request.includeImage),
        text: true,
      })
      const uploadErrors = uploads.errors.filter(Boolean)
      return {
        ...emptySnapshot({
          ok:
            (assetsOnly ? uploads.filled.length > 0 : filled.length > 0) &&
            !errors.some((e) => e.startsWith('evaluate failed')),
          running: true,
          youDrive: state.youDrive,
          url: shot.url,
          title: shot.title,
          text: [
            assetsOnly
              ? `Uploaded ${uploads.filled.length} file(s) to DistroKid.`
              : `Filled ${filled.length} DistroKid field(s)${uploads.filled.length ? ` incl. ${uploads.filled.length} file upload(s)` : ''}.`,
            uploads.filled.length ? `Uploads: ${uploads.filled.join('; ')}` : '',
            skipped.length ? `Skipped: ${skipped.slice(0, 14).join('; ')}` : '',
            uploadErrors.length ? `Upload errors: ${uploadErrors.slice(0, 8).join('; ')}` : '',
            errors.length ? `Errors: ${errors.slice(0, 6).join('; ')}` : '',
            'You drive is on. QC ISRCs (QTA53), UPC blank on new uploads, Social Media Pack off, date, and files — then you click DistroKid Continue. This never auto-submits.',
          ]
            .filter(Boolean)
            .join('\n'),
          error:
            uploadErrors[0] ||
            errors[0] ||
            (assetsOnly && uploads.filled.length === 0
              ? 'No WAV or artwork uploads attached — check packet URLs and DistroKid file inputs.'
              : !assetsOnly && filled.length === 0
                ? 'DistroKid prefill matched no fields — open /new/ and expand track rows first.'
                : undefined),
          imageBase64: request.includeImage ? shot.imageBase64 : undefined,
        }),
        distrokidPrefill: {
          filled,
          skipped,
          errors,
        },
      }
    } else if (request.action === 'soundcloud_prefill') {
      const packet = soundcloudPrepared?.packet ?? null
      if (!packet) {
        return emptySnapshot({
          ok: false,
          running: true,
          youDrive: state.youDrive,
          error: 'SoundCloud files were not ready.',
        })
      }
      if (!/soundcloud\.com\/upload/i.test(page.url())) {
        const navErr = await safeGoto(page, SOUNDCLOUD_UPLOAD_URL)
        if (navErr) {
          return emptySnapshot({ ok: false, running: true, youDrive: state.youDrive, error: navErr })
        }
        if (state.zoom !== 1) await applyPageZoom(page, state.zoom)
        await sleep(1500)
      }
      if (/soundcloud\.com\/.*(signin|login)/i.test(page.url())) {
        return emptySnapshot({
          ok: false,
          running: true,
          youDrive: state.youDrive,
          url: page.url(),
          error: 'Sign in to SoundCloud in this browser, then fill the EP again.',
        })
      }

      const uploads = await uploadSoundCloudAssets(page as never, packet, soundcloudPrepared?.staged)
      const prefill = await prefillSoundCloudPage(page, packet)
      const filled = Array.from(new Set([...uploads.filled, ...prefill.filled]))
      const skipped = Array.from(new Set([...uploads.skipped, ...prefill.skipped]))
      const errors = Array.from(new Set([...uploads.errors, ...prefill.errors, ...packet.warnings]))
      state.youDrive = true
      const shot = await frame(page, { image: Boolean(request.includeImage), text: true })
      const sources = packet.tracks
        .filter((track) => track.audio_url)
        .map((track) => `${track.track_number}. ${track.title} ← ${track.audio_source}`)
        .join('\n')
      return {
        ...emptySnapshot({
          ok: uploads.filled.length > 0 && !uploads.errors.length,
          running: true,
          youDrive: state.youDrive,
          url: shot.url,
          title: shot.title,
          text: [
            `SoundCloud EP “${packet.title}” — ${filled.length} step(s) from database files.`,
            sources,
            skipped.length ? `Skipped: ${skipped.slice(0, 8).join('; ')}` : '',
            errors.length ? `Errors: ${errors.slice(0, 6).join('; ')}` : '',
            'Files came from the release rows in the database, not a local folder. Review the form, then you click Save. This never posts.',
          ]
            .filter(Boolean)
            .join('\n'),
          error: uploads.errors[0] || (!uploads.filled.length ? 'No database audio files attached.' : undefined),
          imageBase64: request.includeImage ? shot.imageBase64 : undefined,
        }),
        soundcloudPrefill: { filled, skipped, errors },
      }
    }

    const live = request.action === 'wheel' || request.action === 'pointer'
    if (live) {
      return emptySnapshot(
        {
          running: true,
          youDrive: state.youDrive,
          url: page.url(),
          text: request.action === 'wheel' ? 'Scrolled the page.' : undefined,
          imageBase64: state.latestFrame || undefined,
        },
        state.viewport,
      )
    }

    const shot = await frame(page, {
      image: Boolean(request.includeImage),
      text:
        request.action === 'read' ||
        request.action === 'navigate' ||
        request.action === 'open' ||
        request.action === 'back' ||
        request.action === 'reload' ||
        request.action === 'click' ||
        request.action === 'type' ||
        request.action === 'press',
    })
    const acted =
      request.action === 'click'
        ? `Clicked${request.target?.trim() ? ` “${request.target.trim()}”` : ''}.`
        : request.action === 'type'
          ? `Typed into${request.target?.trim() ? ` “${request.target.trim()}”` : ' the page'}.`
          : request.action === 'navigate' || request.action === 'open'
            ? `Opened ${shot.url}.`
            : ''
    const distrokidCodes = await readDistroKidPageCodes(page, shot.url)
    const pageText = distrokidCodes
      ? [formatDistroKidPageCodes(distrokidCodes), shot.text].filter(Boolean).join('\n\n')
      : shot.text
    return emptySnapshot(
      {
        running: true,
        youDrive: state.youDrive,
        url: shot.url,
        title: shot.title,
        text: [acted, pageText].filter(Boolean).join('\n').slice(0, 8000) || undefined,
        distrokidCodes: distrokidCodes || undefined,
        imageBase64: request.includeImage ? shot.imageBase64 : undefined,
      },
      state.viewport,
    )
    } catch (error) {
      return emptySnapshot({
        ok: false,
        running: Boolean(state.context?.pages().some((p) => !p.isClosed())),
        youDrive: state.youDrive,
        error: friendlyBrowserError(error),
      })
    }
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function friendlyBrowserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/user data directory|already in use|process_singleton|profile.*lock/i.test(message)) {
    return `${message}. Close any other Admin browser or Chromium window using web/.dev/admin-browser-chrome-profile, then click Open again.`
  }
  if (/Executable doesn't exist|browserType.launch|playwright/i.test(message)) {
    return `${message}. From web/, run: npm run test:e2e:install-browsers`
  }
  return message
}

async function readDistroKidPageCodes(
  page: BrowserPageLike,
  pageUrl: string,
): Promise<DistroKidPageCodes | null> {
  const kind = distrokidPageKind(pageUrl)
  if (!kind || kind === 'upload' || kind === 'other') return null
  if (kind === 'album') {
    const started = Date.now()
    while (Date.now() - started < 4000) {
      const ready = await page
        .evaluate(() => Boolean(document.querySelector('.isrc-value, .track-row')))
        .catch(() => false)
      if (ready) break
      await sleep(200)
    }
  }
  const html =
    kind === 'album'
      ? await page
          .evaluate(() => {
            const chunks: string[] = []
            const header = document.querySelector('.header-content')
            if (header) chunks.push(header.outerHTML)
            const upc = document.querySelector('#js-album-upc')
            if (upc && !header?.contains(upc)) chunks.push(upc.outerHTML)
            const section = document.querySelector('.tracks-section')
            if (section) chunks.push(section.outerHTML)
            else {
              document.querySelectorAll('.track-row').forEach((row) => {
                chunks.push((row as HTMLElement).outerHTML)
              })
            }
            if (!chunks.some((chunk) => /isrc-value/i.test(chunk))) {
              document.querySelectorAll('.isrc-value').forEach((node) => {
                chunks.push((node as HTMLElement).outerHTML)
              })
            }
            return chunks.join('\n').slice(0, 300000)
          })
          .catch(() => '')
      : ''
  return distrokidCodesFromHtml(html, pageUrl)
}

const DISTROKID_CATALOG_CHAT = 'studio-catalog-pull'

function distrokidLoginWall(url: string): boolean {
  try {
    return /signin|login|sign-in/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/**
 * Open a DistroKid album (or My Music when the album URL is unknown) in the
 * admin Chrome profile and return album ISRCs or the listing HTML.
 */
export async function fetchDistroKidAlbumPage(input: {
  albumUrl?: string | null
}): Promise<{
  ok: boolean
  error?: string
  url: string
  codes: DistroKidPageCodes | null
  listingHtml: string
}> {
  const host = adminBrowserHostAllowed()
  if (!host.ok) {
    return { ok: false, error: host.reason, url: '', codes: null, listingHtml: '' }
  }

  const albumUrl = input.albumUrl?.trim() || ''
  const target = albumUrl || 'https://distrokid.com/mymusic/'

  return withLock(DISTROKID_CATALOG_CHAT, async (state) => {
    try {
      const context = await ensureContext(state)
      const page = await ensurePage(context)
      const navErr = await safeGoto(page, target, 45_000)
      if (navErr) return { ok: false, error: navErr, url: page.url(), codes: null, listingHtml: '' }
      if (distrokidLoginWall(page.url())) {
        return {
          ok: false,
          error: 'DistroKid needs a sign-in in the admin browser. Sign in there, then pull again.',
          url: page.url(),
          codes: null,
          listingHtml: '',
        }
      }

      if (albumUrl) {
        const codes = await readDistroKidPageCodes(page, page.url())
        return { ok: true, url: page.url(), codes, listingHtml: '' }
      }

      const started = Date.now()
      let listingHtml = ''
      while (Date.now() - started < 8000) {
        listingHtml = await page
          .evaluate(() => (document.body?.innerHTML || '').slice(0, 400000))
          .catch(() => '')
        if (/albumuuid=/i.test(listingHtml)) break
        await sleep(400)
      }
      return { ok: true, url: page.url(), codes: null, listingHtml }
    } catch (error) {
      return {
        ok: false,
        error: friendlyBrowserError(error),
        url: '',
        codes: null,
        listingHtml: '',
      }
    }
  })
}

async function safeGoto(page: BrowserPageLike, target: string, timeout = 30_000): Promise<string | null> {
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout })
    return null
  } catch (error) {
    return friendlyBrowserError(error)
  }
}
