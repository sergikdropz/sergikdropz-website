'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  chipToken,
  type ComposerChipKind,
} from '@/lib/ai/admin-ai-composer-chips'

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
    framed?: boolean
    onChange: (value: string) => void
    onRemoveChip: (kind: ComposerChipKind, id: string) => void
  }
>(function AdminAiComposerField({ value, chips, disabled, placeholder, framed = true, onChange, onRemoveChip }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const savedOffsetRef = useRef<number | null>(null)
  const pendingCaretRef = useRef<number | null>(null)
  const paintingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onRemoveRef = useRef(onRemoveChip)
  onChangeRef.current = onChange
  onRemoveRef.current = onRemoveChip
  const chipSignature = chips.map((chip) => `${chip.kind}:${chip.id}:${chip.label}:${chip.tone}`).join('|')

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
  }, [value, chips, chipSignature])

  useEffect(() => {
    const onSelect = () => {
      const root = rootRef.current
      if (!root) return
      const sel = window.getSelection()
      if (!sel?.anchorNode || !root.contains(sel.anchorNode)) return
      savedOffsetRef.current = caretOffset(root)
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])

  const empty = value.length === 0

  return (
    <div className="relative">
      {empty ? (
        <span className="pointer-events-none absolute left-3 top-2 text-sm text-gray-500" aria-hidden>
          {placeholder}
        </span>
      ) : null}
      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        aria-disabled={disabled || undefined}
        data-testid="admin-ai-composer"
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck
        onInput={() => {
          if (paintingRef.current) return
          const root = rootRef.current
          if (!root) return
          const next = serializeComposerDom(root)
          savedOffsetRef.current = caretOffset(root)
          if (next !== value) onChangeRef.current(next)
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
        className={`min-h-24 max-h-72 w-full overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6 text-white focus:outline-none ${
          framed
            ? 'rounded-lg border border-gray-700 bg-gray-900 focus:border-purple-500'
            : 'rounded-b-lg border-0 bg-transparent'
        }`}
      />
    </div>
  )
})

export default AdminAiComposerField
