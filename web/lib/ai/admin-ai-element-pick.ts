/** Cursor-style element reference inserted into the Admin AI composer. */

const MAX_CLASSES = 24
const MAX_CLASS_TOKEN = 80
const MAX_PATH_CHARS = 900
const MAX_PATH_DEPTH = 16
const MAX_HTML_CHARS = 700
const MAX_ATTR_VALUE = 220

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

export function elementPickSegment(tag: string, id: string | null, className: string | null): string {
  let segment = tag.toLowerCase()
  const safeId = id && !id.includes(':') && id.length <= 80 ? id : ''
  if (safeId) segment += `#${safeId}`
  const classes = (className || '')
    .split(/\s+/)
    .filter((token) => token && token.length <= MAX_CLASS_TOKEN)
    .slice(0, MAX_CLASSES)
  if (classes.length) segment += `.${classes.join('.')}`
  return segment
}

export type ElementPickState = {
  value?: string
  checked?: boolean
  required?: boolean
  invalid?: boolean
  associatedLabel?: string
  youDrive?: boolean
}

export function formatElementPickText(input: {
  path: string
  top: number
  left: number
  width: number
  height: number
  html: string
  pageUrl?: string
  /** Flattened visible text. Omitted when that text is already inside the HTML line. */
  visible?: string
  state?: ElementPickState
}): string {
  const visible = (input.visible || '').replace(/\s+/g, ' ').trim().slice(0, 220)
  const stateBits: string[] = []
  const state = input.state
  if (state?.associatedLabel) stateBits.push(`label=${JSON.stringify(state.associatedLabel)}`)
  if (state?.value !== undefined && state.value !== '') {
    stateBits.push(`value=${JSON.stringify(state.value.slice(0, 160))}`)
  } else if (state && /<(input|textarea|select)\b/i.test(input.html)) {
    stateBits.push('value=(empty)')
  }
  if (state?.checked != null) stateBits.push(`checked=${state.checked}`)
  if (state?.required) stateBits.push('required')
  if (state?.invalid) stateBits.push('invalid')
  if (state?.youDrive != null) stateBits.push(`youDrive=${state.youDrive ? 'yes' : 'no'}`)

  const lines = [
    input.pageUrl ? `Page: ${input.pageUrl}` : '',
    `DOM Path: ${input.path}`,
    `Position: top=${input.top}px, left=${input.left}px, width=${input.width}px, height=${input.height}px`,
    visible && !input.html.includes(visible) ? `Visible: ${visible}` : '',
    stateBits.length ? `State: ${stateBits.join(' · ')}` : '',
    `HTML Element: ${input.html}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export type ElementPickSource = {
  tag: string
  id: string
  className: string
  ancestors: Array<{ tag: string; id: string; className: string }>
  attrs: Array<{ name: string; value: string }>
  text: string
  childElementCount: number
  top: number
  left: number
  width: number
  height: number
  value?: string
  checked?: boolean
  required?: boolean
  invalid?: boolean
  associatedLabel?: string
}

export type BrowserSurfaceBox = { top: number; left: number; width: number; height: number }

/** Bitmap area inside the browser mirror (`object-contain object-top`). */
export function browserImageContentRect(
  surface: BrowserSurfaceBox,
  viewportWidth: number,
  viewportHeight: number,
): BrowserSurfaceBox {
  const vw = Math.max(1, viewportWidth)
  const vh = Math.max(1, viewportHeight)
  const scale = Math.min(surface.width / vw, surface.height / vh)
  const width = vw * scale
  const height = vh * scale
  return {
    left: surface.left + (surface.width - width) / 2,
    top: surface.top,
    width,
    height,
  }
}

/** Ratio on the live page, or null when the pointer is in the mirror's letterbox. */
export function browserSurfaceRatio(
  clientX: number,
  clientY: number,
  content: BrowserSurfaceBox,
): { x: number; y: number } | null {
  if (content.width < 1 || content.height < 1) return null
  const x = (clientX - content.left) / content.width
  const y = (clientY - content.top) / content.height
  if (x < 0 || y < 0 || x > 1 || y > 1) return null
  return { x, y }
}

export function mapBrowserElementRect(
  remote: BrowserSurfaceBox,
  content: BrowserSurfaceBox,
  viewportWidth: number,
  viewportHeight: number,
): BrowserSurfaceBox {
  const sx = content.width / Math.max(1, viewportWidth)
  const sy = content.height / Math.max(1, viewportHeight)
  return {
    top: content.top + remote.top * sy,
    left: content.left + remote.left * sx,
    width: Math.max(0, remote.width * sx),
    height: Math.max(0, remote.height * sy),
  }
}

function htmlFromParts(
  tag: string,
  attrs: Array<{ name: string; value: string }>,
  text: string,
  childElementCount: number,
): string {
  const rendered: string[] = []
  for (const attr of attrs) {
    if (attr.name === 'data-cursor-ref' || attr.name === 'data-cursor-element-id') continue
    if (attr.name === 'data-admin-ai-element-picker') continue
    let value = attr.value.replace(/\s+/g, ' ').trim()
    if (value.length > MAX_ATTR_VALUE) value = `${value.slice(0, MAX_ATTR_VALUE - 1)}…`
    rendered.push(`${attr.name}="${value.replace(/"/g, '&quot;')}"`)
  }
  const open = `<${tag}${rendered.length ? ` ${rendered.join(' ')}` : ''}`
  if (VOID_TAGS.has(tag)) {
    const line = `${open}>`
    return line.length > MAX_HTML_CHARS ? `${line.slice(0, MAX_HTML_CHARS - 1)}…` : line
  }
  const inner = childElementCount === 0 && text && text.length <= 80 ? text : ''
  let line = `${open}>${inner}</${tag}>`
  if (line.length > MAX_HTML_CHARS) line = `${line.slice(0, MAX_HTML_CHARS - 1)}…`
  return line
}

function htmlElementLine(el: Element): string {
  return htmlFromParts(
    el.tagName.toLowerCase(),
    Array.from(el.attributes).map((attr) => ({ name: attr.name, value: attr.value })),
    (el.textContent || '').replace(/\s+/g, ' ').trim(),
    el.childElementCount,
  )
}

function joinDomPath(segments: string[]): string {
  const next = segments.slice(-MAX_PATH_DEPTH)
  while (next.length > 1 && next.join(' > ').length > MAX_PATH_CHARS) next.shift()
  return next.join(' > ')
}

function associatedLabelForElement(el: Element): string {
  if (el.id) {
    try {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (byFor) return (byFor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    } catch {
      /* ignore */
    }
  }
  const parentLabel = el.closest('label')
  if (parentLabel) return (parentLabel.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return ''
}

function stateFromElement(el: Element): ElementPickState {
  const input = el as HTMLInputElement
  const hasValue = 'value' in el && typeof input.value === 'string'
  const invalid =
    input.getAttribute?.('aria-invalid') === 'true' ||
    /error|invalid|required|danger|\bred\b/i.test(el.getAttribute('class') || '')
  return {
    associatedLabel: associatedLabelForElement(el) || undefined,
    value: hasValue ? String(input.value || '').slice(0, 160) : undefined,
    checked:
      el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')
        ? el.checked
        : undefined,
    required: Boolean(input.required || input.getAttribute?.('aria-required') === 'true'),
    invalid: Boolean(invalid),
  }
}

export function formatElementPickSource(
  source: ElementPickSource,
  pageUrl?: string,
  extras?: { youDrive?: boolean },
): string {
  const segments = [
    ...source.ancestors.map((ancestor) => elementPickSegment(ancestor.tag, ancestor.id, ancestor.className)),
    elementPickSegment(source.tag, source.id, source.className),
  ]
  return formatElementPickText({
    path: joinDomPath(segments),
    top: source.top,
    left: source.left,
    width: source.width,
    height: source.height,
    html: htmlFromParts(source.tag, source.attrs, source.text, source.childElementCount),
    visible: source.text,
    pageUrl,
    state: {
      value: source.value,
      checked: source.checked,
      required: source.required,
      invalid: source.invalid,
      associatedLabel: source.associatedLabel,
      youDrive: extras?.youDrive,
    },
  })
}

export function elementPickLabelFromParts(source: {
  tag: string
  id: string
  className: string
  attrs: Array<{ name: string; value: string }>
  text: string
  associatedLabel?: string
}): string {
  const tag = source.tag.toLowerCase()
  const id = source.id && !source.id.includes(':') ? `#${source.id}` : ''
  const attr = (name: string) =>
    source.attrs.find((item) => item.name === name)?.value.replace(/\s+/g, ' ').trim() || ''
  const aria = attr('aria-label')
  if (aria) return `${tag}${id} "${aria.slice(0, 42)}"`
  const title = attr('title')
  if (title) return `${tag}${id} "${title.slice(0, 42)}"`
  if (source.associatedLabel) return `${tag}${id} "${source.associatedLabel.slice(0, 42)}"`
  const text = source.text.replace(/\s+/g, ' ').trim()
  if (text) return `${tag}${id} "${text.slice(0, 42)}"`
  const classes = source.className.split(/\s+/).filter(Boolean).slice(0, 2)
  return classes.length ? `${tag}${id}.${classes.join('.')}` : `${tag}${id || ''}`
}

function roundPx(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function asText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Accepts the plain object returned from the live browser page. */
export function normalizeElementPickSource(raw: unknown): ElementPickSource | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const tag = asText(row.tag, 40).toLowerCase()
  if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) return null
  const ancestorsRaw = Array.isArray(row.ancestors) ? row.ancestors : []
  const ancestors = ancestorsRaw.slice(0, MAX_PATH_DEPTH).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const ancestor = item as Record<string, unknown>
    const ancestorTag = asText(ancestor.tag, 40).toLowerCase()
    if (!ancestorTag) return []
    return [{ tag: ancestorTag, id: asText(ancestor.id, 80), className: asText(ancestor.className, 500) }]
  })
  const attrsRaw = Array.isArray(row.attrs) ? row.attrs : []
  const attrs = attrsRaw.slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const attr = item as Record<string, unknown>
    const name = asText(attr.name, 80)
    if (!name) return []
    return [{ name, value: asText(attr.value, MAX_ATTR_VALUE) }]
  })
  const checkedRaw = row.checked
  return {
    tag,
    id: asText(row.id, 80),
    className: asText(row.className, 500),
    ancestors,
    attrs,
    text: asText(row.text, 220),
    childElementCount: Math.max(0, roundPx(row.childElementCount)),
    top: roundPx(row.top),
    left: roundPx(row.left),
    width: Math.max(0, roundPx(row.width)),
    height: Math.max(0, roundPx(row.height)),
    value: asText(row.value, 160) || undefined,
    checked: typeof checkedRaw === 'boolean' ? checkedRaw : undefined,
    required: Boolean(row.required),
    invalid: Boolean(row.invalid),
    associatedLabel: asText(row.associatedLabel, 120) || undefined,
  }
}

function buildDomPath(el: Element): string {
  const segments: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && node !== document.body && node !== document.documentElement && depth < MAX_PATH_DEPTH) {
    segments.unshift(elementPickSegment(node.tagName, node.id || null, node.getAttribute('class')))
    node = node.parentElement
    depth += 1
  }
  return joinDomPath(segments)
}

/** Live browser mirror. Clicks here are a picture of another page, not this document. */
export function browserSurfaceFromPoint(x: number, y: number): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const stack = document.elementsFromPoint(x, y)
  if (stack[0] && isElementPickerChrome(stack[0])) return null
  for (const node of stack) {
    if (!(node instanceof Element)) continue
    if (isElementPickerChrome(node)) continue
    const surface = node.closest('[data-admin-browser-surface]')
    if (surface instanceof HTMLElement) return surface
  }
  return null
}

export function browserSurfaceMetrics(surface: HTMLElement): {
  surface: BrowserSurfaceBox
  viewportWidth: number
  viewportHeight: number
  content: BrowserSurfaceBox
} {
  const box = surface.getBoundingClientRect()
  const viewportWidth = Number(surface.dataset.viewportWidth) || box.width
  const viewportHeight = Number(surface.dataset.viewportHeight) || box.height
  const surfaceBox = { top: box.top, left: box.left, width: box.width, height: box.height }
  return {
    surface: surfaceBox,
    viewportWidth,
    viewportHeight,
    content: browserImageContentRect(surfaceBox, viewportWidth, viewportHeight),
  }
}

/** Same three-line block the Cursor element picker writes into chat. */
export function formatDomElementPick(el: Element): string {
  const rect = el.getBoundingClientRect()
  const visible = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220)
  return formatElementPickText({
    path: buildDomPath(el),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    html: htmlElementLine(el),
    visible,
    state: stateFromElement(el),
  })
}

export function isElementPickerChrome(node: EventTarget | null): boolean {
  return node instanceof Element && Boolean(node.closest('[data-admin-ai-element-picker]'))
}

/** Element under the pointer. Picker chrome (the button, hint, highlight) is not a target. */
export function elementUnderPointer(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y)
  if (stack[0] && isElementPickerChrome(stack[0])) return null
  for (const node of stack) {
    if (!(node instanceof Element)) continue
    if (node === document.documentElement || node === document.body) continue
    if (isElementPickerChrome(node)) continue
    const rect = node.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    return node
  }
  return null
}

export function elementPickHoverLabel(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id && !el.id.includes(':') ? `#${el.id}` : ''
  const aria = el.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim()
  if (aria) return `${tag}${id} "${aria.slice(0, 42)}"`
  const title = el.getAttribute('title')?.replace(/\s+/g, ' ').trim()
  if (title) return `${tag}${id} "${title.slice(0, 42)}"`
  const associated = associatedLabelForElement(el)
  if (associated) return `${tag}${id} "${associated.slice(0, 42)}"`
  const classes = (el.getAttribute('class') || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  return classes.length ? `${tag}${id}.${classes.join('.')}` : `${tag}${id || ''}`
}
