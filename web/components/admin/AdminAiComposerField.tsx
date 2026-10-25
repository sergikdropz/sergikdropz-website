'use client'

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  chipToken,
  type ComposerChipKind,
} from '@/lib/ai/admin-ai-composer-chips'
import {
  activeComposerMention,
  filterMentionMenu,
  type MentionMenuItem,
} from '@/lib/ai/admin-ai-mentions'

export type ComposerChipView = {
  kind: ComposerChipKind
  id: string
  label: string
  title: string
  tone: 'element' | 'file' | 'file-reading' | 'file-error' | 'link'
}

export type AdminAiComposerFieldHandle = {
  focus: () => void
  currentValue: () => string
  insertionOffset: () => number
  offsetFromPoint: (x: number, y: number) => number | null
  expectCaretAt: (offset: number) => void
}

const TONE_CLASS: Record<ComposerChipView['tone'], string> = {
  element: 'border-sky-500/40 bg-sky-950/70 text-sky-100',
  file: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-100',
  'file-reading': 'border-gray-600 bg-gray-800 text-gray-300',
  'file-error': 'border-red-500/40 bg-red-950/60 text-red-100',
  link: 'border-violet-500/40 bg-violet-950/60 text-violet-100',
}

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

function kindFromDataset(value: string | undefined): ComposerChipKind | null {
  if (!value) return null
  return CODE_KIND[value] ?? null
}

function serializeComposerDom(root: HTMLElement): string {
  let out = ''
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? '').replace(/\u00a0/g, ' ')
      return
    }
    if (!(node instanceof HTMLElement)) return
    const kind = kindFromDataset(node.dataset.chipKind)
    if (kind && node.dataset.chipId) {
      out += chipToken(kind, node.dataset.chipId)
      return
    }
    if (node.tagName === 'BR') {
      out += '\n'
      return
    }
    const isBlock = node.tagName === 'DIV' || node.tagName === 'P'
    if (isBlock && out.length > 0 && !out.endsWith('\n')) out += '\n'
    const before = out.length
    node.childNodes.forEach((child) => visit(child))
    if (isBlock && out.length === before) out += '\n'
  }
  root.childNodes.forEach((child) => visit(child))
  if (!root.querySelector('[data-chip-kind]') && out.replace(/\n/g, '').trim() === '' && /^\n+$/.test(out)) {
    return ''
  }
  return out
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y)
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (!pos) return null
  const range = document.createRange()
  range.setStart(pos.offsetNode, pos.offset)
  range.collapse(true)
  return range
}

function caretOffset(root: HTMLElement, range?: Range | null): number {
  const sel = range ? null : window.getSelection()
  const active = range ?? (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null)
  if (!active || (!root.contains(active.startContainer) && active.startContainer !== root)) {
    return serializeComposerDom(root).length
  }
  const pre = document.createRange()
  pre.selectNodeContents(root)
  try {
    pre.setEnd(active.startContainer, active.startOffset)
  } catch {
    return serializeComposerDom(root).length
  }
  const holder = document.createElement('div')
  holder.append(pre.cloneContents())
  return serializeComposerDom(holder).length
}

function placeCaretAt(root: HTMLElement, offset: number) {
  let remaining = Math.max(0, offset)
  const place = (node: Node, nodeOffset: number) => {
    const range = document.createRange()
    range.setStart(node, nodeOffset)
    range.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  const visit = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ')
      if (remaining <= text.length) {
        place(node, remaining)
        return true
      }
      remaining -= text.length
      return false
    }
    if (!(node instanceof HTMLElement)) return false
    const kind = kindFromDataset(node.dataset.chipKind)
    if (kind && node.dataset.chipId) {
      const len = chipToken(kind, node.dataset.chipId).length
      const parent = node.parentNode ?? root
      const index = [...parent.childNodes].indexOf(node)
      if (remaining <= 0) {
        place(parent, Math.max(0, index))
        return true
      }
      if (remaining < len) {
        place(parent, index + 1)
        return true
      }
      remaining -= len
      return false
    }
    if (node.tagName === 'BR') {
      if (remaining <= 1) {
        const parent = node.parentNode ?? root
        place(parent, [...parent.childNodes].indexOf(node) + 1)
        return true
      }
      remaining -= 1
      return false
    }
    for (const child of node.childNodes) {
      if (visit(child)) return true
    }
    return false
  }
  if (!visit(root)) {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

function paintComposer(
  root: HTMLElement,
  value: string,
  chips: ComposerChipView[],
  onRemove: (kind: ComposerChipKind, id: string) => void,
) {
  const lookup = new Map(chips.map((chip) => [`${chip.kind}:${chip.id}`, chip]))
  const frag = document.createDocumentFragment()
  const re = /\uE000([efl]):([A-Za-z0-9_-]{8,80})\uE001/g
  let last = 0
  const pushText = (text: string) => {
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      if (index > 0) frag.append(document.createElement('br'))
      if (line) frag.append(document.createTextNode(line))
    })
  }
  for (const match of value.matchAll(re)) {
    const index = match.index ?? 0
    if (index > last) pushText(value.slice(last, index))
    const kind = CODE_KIND[match[1] ?? '']
    const id = match[2] ?? ''
    if (kind && id) frag.append(chipElement(lookup.get(`${kind}:${id}`) ?? fallbackChip(kind, id), onRemove))
    last = index + match[0].length
  }
  if (last < value.length) pushText(value.slice(last))
  root.replaceChildren(frag)
}

function fallbackChip(kind: ComposerChipKind, id: string): ComposerChipView {
  return {
    kind,
    id,
    label: kind,
    title: '',
    tone: kind === 'file' ? 'file' : kind === 'link' ? 'link' : 'element',
  }
}

function rangeAtOffset(root: HTMLElement, offset: number): Range | null {
  let remaining = Math.max(0, offset)
  const collapsed = (node: Node, nodeOffset: number) => {
    const range = document.createRange()
    range.setStart(node, nodeOffset)
    range.collapse(true)
    return range
  }
  const visit = (node: Node): Range | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ')
      if (remaining <= text.length) return collapsed(node, remaining)
      remaining -= text.length
      return null
    }
    if (!(node instanceof HTMLElement)) return null
    const kind = kindFromDataset(node.dataset.chipKind)
    if (kind && node.dataset.chipId) {
      const len = chipToken(kind, node.dataset.chipId).length
      const parent = node.parentNode ?? root
      const index = [...parent.childNodes].indexOf(node)
      if (remaining <= 0) return collapsed(parent, Math.max(0, index))
      if (remaining < len) return collapsed(parent, index + 1)
      remaining -= len
      return null
    }
    if (node.tagName === 'BR') {
      const parent = node.parentNode ?? root
      const index = [...parent.childNodes].indexOf(node)
      if (remaining <= 1) return collapsed(parent, index + (remaining === 0 ? 0 : 1))
      remaining -= 1
      return null
    }
    for (const child of node.childNodes) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(root)
}

function mentionWordRect(root: HTMLElement, start: number, caret: number): DOMRect | null {
  const range = rangeAtOffset(root, start)
  if (!range) return null
  const end = rangeAtOffset(root, Math.max(start + 1, caret))
  if (end && end.startContainer === range.startContainer) {
    try {
      range.setEnd(end.startContainer, end.startOffset)
    } catch {
      /* The @ glyph rect is enough when the end point sits in another node. */
    }
  } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent ?? ''
    if (range.startOffset < text.length) range.setEnd(range.startContainer, range.startOffset + 1)
  }
  const rect = range.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) return null
  return rect
}

const MENTION_MENU_W = 280

function placeMentionMenu(anchor: DOMRect): { top: number; left: number } {
  const margin = 8
  let left = Math.round(anchor.right + margin)
  const top = Math.round(anchor.top)
  if (left + MENTION_MENU_W > window.innerWidth - margin) {
    left = Math.round(anchor.left - MENTION_MENU_W - margin)
  }
  if (left < margin) left = margin
  return { top, left }
}

function chipElement(view: ComposerChipView, onRemove: (kind: ComposerChipKind, id: string) => void) {
  const span = document.createElement('span')
  span.contentEditable = 'false'
  span.dataset.chipKind = KIND_CODE[view.kind]
  span.dataset.chipId = view.id
  span.dataset.testid = 'admin-ai-composer-chip'
  span.title = view.title
  span.className = `mx-0.5 inline-flex max-w-full items-center gap-1 align-middle rounded-md border px-1.5 py-0.5 text-[11px] leading-4 ${TONE_CLASS[view.tone]}`
  const label = document.createElement('span')
  label.className = 'max-w-[14rem] truncate'
  label.textContent = view.tone === 'file-reading' ? `${view.label} …` : view.label
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'rounded px-0.5 text-current/80 hover:bg-black/30 hover:text-white'
  remove.setAttribute('aria-label', `Remove ${view.label}`)
  remove.textContent = '×'
  remove.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onRemove(view.kind, view.id)
  })
  span.append(label, remove)
  return span
}

const AdminAiComposerField = forwardRef<
  AdminAiComposerFieldHandle,
  {
    value: string
    chips: ComposerChipView[]
    disabled?: boolean
    placeholder: string
    suggestion?: string
    framed?: boolean
    onChange: (value: string) => void
    onRemoveChip: (kind: ComposerChipKind, id: string) => void
  }
>(function AdminAiComposerField(
  { value, chips, disabled, placeholder, suggestion = '', framed = true, onChange, onRemoveChip },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const savedOffsetRef = useRef<number | null>(null)
  const pendingCaretRef = useRef<number | null>(null)
  const paintingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onRemoveRef = useRef(onRemoveChip)
  onChangeRef.current = onChange
  onRemoveRef.current = onRemoveChip
  const chipSignature = chips.map((chip) => `${chip.kind}:${chip.id}:${chip.label}:${chip.tone}`).join('|')
  const suggestionId = useId()
  const ghost = suggestion.trim()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dismissedMentionRef = useRef<string | null>(null)
  const mentionQueryRef = useRef('')
  const [mention, setMention] = useState<{
    start: number
    caret: number
    query: string
    top: number
    left: number
  } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionItems = mention ? filterMentionMenu(mention.query) : []
  const activeMentionIndex = Math.min(mentionIndex, Math.max(0, mentionItems.length - 1))

  const refreshMention = () => {
    const root = rootRef.current
    if (!root || disabled || document.activeElement !== root) {
      setMention(null)
      return
    }
    const current = serializeComposerDom(root)
    const caret = caretOffset(root)
    const active = activeComposerMention(current, caret)
    if (!active) {
      dismissedMentionRef.current = null
      setMention(null)
      return
    }
    if (dismissedMentionRef.current && dismissedMentionRef.current !== active.query) {
      dismissedMentionRef.current = null
    }
    if (dismissedMentionRef.current === active.query) {
      setMention(null)
      return
    }
    const rect = mentionWordRect(root, active.start, caret)
    if (!rect) {
      setMention(null)
      return
    }
    if (mentionQueryRef.current !== active.query) {
      mentionQueryRef.current = active.query
      setMentionIndex(0)
    }
    const box = placeMentionMenu(rect)
    setMention((prev) => {
      const top = prev && prev.query === active.query && prev.left === box.left ? prev.top : box.top
      if (
        prev &&
        prev.start === active.start &&
        prev.caret === caret &&
        prev.query === active.query &&
        prev.top === top &&
        prev.left === box.left
      ) {
        return prev
      }
      return { start: active.start, caret, query: active.query, top, left: box.left }
    })
  }
  const refreshMentionRef = useRef(refreshMention)
  refreshMentionRef.current = refreshMention

  const applyMention = (item: MentionMenuItem) => {
    const root = rootRef.current
    if (!root) return
    const current = serializeComposerDom(root)
    const caret = caretOffset(root)
    const active = activeComposerMention(current, caret)
    if (!active) return
    const next = `${current.slice(0, active.start)}${item.insert}${current.slice(caret)}`
    pendingCaretRef.current = active.start + item.insert.length
    dismissedMentionRef.current = null
    mentionQueryRef.current = ''
    setMention(null)
    onChangeRef.current(next)
  }

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus({ preventScroll: true }),
    currentValue: () => (rootRef.current ? serializeComposerDom(rootRef.current) : value),
    insertionOffset: () => {
      const root = rootRef.current
      if (!root) return value.length
      if (document.activeElement === root) return caretOffset(root)
      if (savedOffsetRef.current != null) return savedOffsetRef.current
      return serializeComposerDom(root).length
    },
    offsetFromPoint: (x, y) => {
      const root = rootRef.current
      if (!root) return null
      const range = rangeFromPoint(x, y)
      if (!range || !root.contains(range.startContainer)) return null
      return caretOffset(root, range)
    },
    expectCaretAt: (offset) => {
      pendingCaretRef.current = offset
    },
  }))

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const pending = pendingCaretRef.current
    const same = serializeComposerDom(root) === value && pending == null
    const paintedSig = root.dataset.chipSignature ?? ''
    if (same && paintedSig === chipSignature) return
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const restoreOffset = pending == null && document.activeElement === root ? caretOffset(root) : null
    paintingRef.current = true
    paintComposer(root, value, chips, (kind, id) => onRemoveRef.current(kind, id))
    root.dataset.chipSignature = chipSignature
    paintingRef.current = false
    if (pending != null) {
      pendingCaretRef.current = null
      root.focus({ preventScroll: true })
      placeCaretAt(root, pending)
      savedOffsetRef.current = pending
    } else if (restoreOffset != null) {
      placeCaretAt(root, restoreOffset)
    }
    window.scrollTo(scrollX, scrollY)
    refreshMentionRef.current()
  }, [value, chips, chipSignature])

  useEffect(() => {
    const onSelect = () => {
      const root = rootRef.current
      if (!root) return
      const sel = window.getSelection()
      if (sel?.anchorNode && root.contains(sel.anchorNode)) {
        savedOffsetRef.current = caretOffset(root)
      }
      refreshMentionRef.current()
    }
    document.addEventListener('selectionchange', onSelect)
    window.addEventListener('resize', onSelect)
    const root = rootRef.current
    root?.addEventListener('scroll', onSelect, { passive: true })
    return () => {
      document.removeEventListener('selectionchange', onSelect)
      window.removeEventListener('resize', onSelect)
      root?.removeEventListener('scroll', onSelect)
    }
  }, [])

  useEffect(() => {
    const node = menuRef.current
    if (!node || !mention) return
    const active = node.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
    const rect = node.getBoundingClientRect()
    const overflow = rect.bottom - (window.innerHeight - 8)
    if (overflow > 1) {
      const top = Math.max(8, mention.top - overflow)
      if (top !== mention.top) setMention((prev) => (prev ? { ...prev, top } : prev))
    }
  }, [activeMentionIndex, mention])

  const empty = value.length === 0
  const showGhost = empty && ghost.length > 0 && !disabled

  return (
    <div
      className={`relative ${
        framed ? 'rounded-lg border border-gray-700 bg-gray-900 focus-within:border-purple-500' : ''
      }`}
    >
      {showGhost ? (
        <>
          <span
            className="pointer-events-none absolute inset-x-3 top-2 bottom-8 z-0 overflow-hidden pr-14 text-sm leading-6 text-gray-400"
            aria-hidden
          >
            {ghost}
          </span>
          <span
            className="pointer-events-none absolute bottom-2 right-3 z-0 rounded border border-gray-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-300"
            aria-hidden
          >
            Tab
          </span>
          <span id={suggestionId} className="sr-only">
            Suggestion: {ghost}. Press Tab to insert it, or type a new message.
          </span>
        </>
      ) : empty ? (
        <span className="pointer-events-none absolute left-3 top-2 z-0 text-sm text-gray-500" aria-hidden>
          {placeholder}
        </span>
      ) : null}
      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        aria-disabled={disabled || undefined}
        aria-describedby={showGhost ? suggestionId : undefined}
        data-testid="admin-ai-composer"
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck
        onKeyDown={(event) => {
          if (mention && mentionItems.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setMentionIndex((current) => (current + 1) % mentionItems.length)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setMentionIndex((current) => (current - 1 + mentionItems.length) % mentionItems.length)
              return
            }
            if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey)) {
              event.preventDefault()
              const item = mentionItems[activeMentionIndex]
              if (item) applyMention(item)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              dismissedMentionRef.current = mention.query
              setMention(null)
              return
            }
          }
          if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return
          if (!showGhost) return
          event.preventDefault()
          pendingCaretRef.current = ghost.length
          onChangeRef.current(ghost)
        }}
        onInput={() => {
          if (paintingRef.current) return
          const root = rootRef.current
          if (!root) return
          const next = serializeComposerDom(root)
          savedOffsetRef.current = caretOffset(root)
          if (next !== value) onChangeRef.current(next)
          refreshMentionRef.current()
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData?.getData('text/plain') ?? ''
          if (!text) return
          const root = rootRef.current
          if (!root) return
          const sel = window.getSelection()
          if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
            root.append(document.createTextNode(text))
          } else {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            const node = document.createTextNode(text)
            range.insertNode(node)
            range.setStartAfter(node)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
          }
          onChangeRef.current(serializeComposerDom(root))
        }}
        className={`relative z-10 ${showGhost ? 'min-h-32' : 'min-h-24'} max-h-72 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2 text-sm leading-6 text-white focus:outline-none ${
          framed ? '' : 'rounded-b-lg border-0'
        }`}
      />
      {mention && mentionItems.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="Mention suggestions"
              data-testid="admin-ai-mention-menu"
              className="max-h-56 w-[17.5rem] overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 py-1 shadow-2xl"
              style={{ position: 'fixed', top: mention.top, left: mention.left, zIndex: 12000 }}
            >
              {mentionItems.map((item, index) => {
                const active = index === activeMentionIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active ? 'true' : 'false'}
                    className={`flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-[12px] ${
                      active ? 'bg-gray-800 text-white' : 'text-gray-200 hover:bg-gray-900'
                    }`}
                    onMouseEnter={() => setMentionIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyMention(item)}
                  >
                    <span className="shrink-0 font-medium text-purple-200">{item.label}</span>
                    <span className="min-w-0 truncate text-[10px] text-gray-500">{item.hint}</span>
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})

export default AdminAiComposerField
