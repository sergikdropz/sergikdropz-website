/** Inline composer chips: element picks, files, and links sit in the typed sentence. */

import { annotateElementPick } from '@/lib/ai/admin-ai-tool-literacy'

export type ComposerChipKind = 'element' | 'file' | 'link'

const KIND_CODE: Record<ComposerChipKind, string> = {
  element: 'e',
  file: 'f',
  link: 'l',
}

const CODE_KIND: Record<string, ComposerChipKind> = {
  e: 'element',
  f: 'file',
  l: 'link',
}

const CHIP_RE = /\uE000([efl]):([A-Za-z0-9_-]{8,80})\uE001/g

export type ComposerChipRef = { kind: ComposerChipKind; id: string }

export function chipToken(kind: ComposerChipKind, id: string): string {
  return `\uE000${KIND_CODE[kind]}:${id}\uE001`
}

export function chipsIn(value: string): ComposerChipRef[] {
  return [...value.matchAll(CHIP_RE)].flatMap((match) => {
    const kind = CODE_KIND[match[1] ?? '']
    const id = match[2]
    if (!kind || !id) return []
    return [{ kind, id }]
  })
}

export function stripChipKind(value: string, kind: ComposerChipKind): string {
  const code = KIND_CODE[kind]
  return value
    .replace(new RegExp(`\\uE000${code}:[A-Za-z0-9_-]{8,80}\\uE001`, 'g'), '')
    .replace(/[^\S\n]{2,}/g, ' ')
}

export function removeChipToken(value: string, kind: ComposerChipKind, id: string): string {
  const token = chipToken(kind, id)
  if (!value.includes(token)) return value
  return value.split(token).join('').replace(/[^\S\n]{2,}/g, ' ')
}

/** Insert a chip at a caret offset. A space keeps it between the surrounding words. */
export function insertChipToken(
  value: string,
  offset: number,
  kind: ComposerChipKind,
  id: string,
): { value: string; caret: number } {
  const token = chipToken(kind, id)
  const i = Math.max(0, Math.min(offset, value.length))
  const before = value.slice(0, i)
  const after = value.slice(i)
  const left = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
  const right = after.length === 0 || !/^\s/.test(after) ? ' ' : ''
  const next = `${before}${left}${token}${right}${after}`
  const caret = before.length + left.length + token.length + right.length
  return { value: next, caret }
}

export function appendMissingChipTokens(value: string, kind: ComposerChipKind, ids: string[]): string {
  const present = new Set(chipsIn(value).filter((chip) => chip.kind === kind).map((chip) => chip.id))
  let next = value
  let cursor = next.length
  for (const id of ids) {
    if (present.has(id)) continue
    const placed = insertChipToken(next, cursor, kind, id)
    next = placed.value
    cursor = placed.caret
  }
  return next
}

/** Text with chips removed, for /plan and /exec detection. */
export function composerPlainText(value: string): string {
  return value.replace(CHIP_RE, ' ').replace(/[^\S\n]+/g, ' ').trim()
}

export function composerDisplayText(
  value: string,
  labels: Array<{ kind: ComposerChipKind; id: string; label: string }>,
): string {
  const map = new Map(labels.map((row) => [`${row.kind}:${row.id}`, row.label]))
  return value
    .replace(CHIP_RE, (_, code: string, id: string) => {
      const kind = CODE_KIND[code]
      const label = (kind && map.get(`${kind}:${id}`)) || kind || 'item'
      return `[${label}]`
    })
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

export function stripPlanPrefix(value: string): string | null {
  const plain = composerPlainText(value)
  if (!plain.toLowerCase().startsWith('/plan ')) return null
  const stripped = value.replace(/^(?:\s|\uE000[efl]:[A-Za-z0-9_-]{8,80}\uE001)*\/plan\s+/i, '')
  return stripped === value ? null : stripped
}

type ExpandElement = { id: string; text: string }
type ExpandFile = { id: string; label: string; status: string; excerpt?: string }
type ExpandLink = { id: string; url: string }

/** Model text: each chip is replaced where it sits in the sentence. */
export function expandComposerMessage(
  value: string,
  ctx: { elements: ExpandElement[]; attachments: ExpandFile[]; links: ExpandLink[] },
): string {
  const expanded = value.replace(CHIP_RE, (_, code: string, id: string) => {
    if (code === 'e') {
      const pick = ctx.elements.find((row) => row.id === id)
      return pick?.text.trim() ? `\n\n${annotateElementPick(pick.text)}\n\n` : ''
    }
    if (code === 'f') {
      const file = ctx.attachments.find((row) => row.id === id)
      if (!file || file.status !== 'ready' || !file.excerpt?.trim()) return ''
      return `\n\n--- Attached: ${file.label} ---\n${file.excerpt.trim()}\n\n`
    }
    const link = ctx.links.find((row) => row.id === id)
    return link?.url ? ` ${link.url} ` : ''
  })
  return expanded.replace(/[^\S\n]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function isHttpUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2000) return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function composerLinkLabel(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const text = `${parsed.hostname}${path}${parsed.search}`
    return text.length > 48 ? `${text.slice(0, 46)}…` : text
  } catch {
    return url.length > 48 ? `${url.slice(0, 46)}…` : url
  }
}

/** URLs from a drop. Plain text is used only when every line is a URL. */
export function linksFromDrop(data: { uriList?: string; plain?: string; moz?: string }): string[] {
  const found: string[] = []
  const push = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    if (!isHttpUrl(trimmed)) return
    if (!found.includes(trimmed)) found.push(trimmed)
  }
  for (const line of (data.uriList ?? '').split(/\r?\n/)) push(line)
  const mozLines = (data.moz ?? '').split(/\r?\n/)
  for (let i = 0; i < mozLines.length; i += 2) push(mozLines[i] ?? '')
  const plainLines = (data.plain ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (plainLines.length > 0 && plainLines.every((line) => line.startsWith('#') || isHttpUrl(line))) {
    plainLines.forEach(push)
  }
  return found.slice(0, 8)
}
