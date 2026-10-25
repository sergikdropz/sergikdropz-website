'use client'

import { Fragment, useState } from 'react'
import {
  parseAdminChatActionChoices,
  stripAdminChatActionChoiceMarkup,
  type AdminChatActionChoice,
} from '@/lib/ai/admin-chat-action-choices'
import {
  REPLY_GROUP_TONE_CLASS,
  isReplyLeadIn,
  replyGroupTone,
  type ReplyGroupTone,
} from '@/lib/ai/admin-chat-group-tone'

type LineParsed =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'li'; ordered: boolean; text: string }
  | { kind: 'p'; text: string }

function parseLine(line: string): LineParsed | null {
  const t = line.trim()
  if (!t) return null
  const hm = t.match(/^(#{1,3})\s+(.+)$/)
  if (hm) {
    const level = hm[1].length as 1 | 2 | 3
    return { kind: 'h', level, text: hm[2] }
  }
  const ulm = t.match(/^[-*•]\s+(.+)$/)
  if (ulm) return { kind: 'li', ordered: false, text: ulm[1] }
  const olm = t.match(/^\d+\.\s+(.+)$/)
  if (olm) return { kind: 'li', ordered: true, text: olm[1] }
  return { kind: 'p', text: t }
}

function renderInline(text: string, keyPrefix: string, accentClass: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/)
    if (m) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className={`font-semibold ${accentClass}`}>
          {m[1]}
        </strong>
      )
    }
    return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>
  })
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string }

function linesToBlocks(lines: string[]): Block[] {
  const parsed = lines.map((l) => parseLine(l)).filter((x): x is LineParsed => x !== null)
  const blocks: Block[] = []
  let i = 0
  while (i < parsed.length) {
    const row = parsed[i]!
    if (row.kind === 'h') {
      blocks.push({ type: 'heading', level: row.level, text: row.text })
      i += 1
      continue
    }
    if (row.kind === 'li') {
      const ordered = row.ordered
      const items: string[] = [row.text]
      i += 1
      while (i < parsed.length && parsed[i]!.kind === 'li') {
        const next = parsed[i]!
        if (next.kind !== 'li') break
        if (next.ordered !== ordered) break
        items.push(next.text)
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    blocks.push({ type: 'paragraph', text: row.text })
    i += 1
  }
  return blocks
}

function isBoldTitle(text: string): boolean {
  return /^\*\*[^*]+\*\*$/.test(text.trim())
}

function headingClass(
  level: 1 | 2 | 3,
  headingColor: { h1: string; h2: string; h3: string },
  tone: ReplyGroupTone | null,
): string {
  const color = tone ? REPLY_GROUP_TONE_CLASS[tone].text : level === 1 ? headingColor.h1 : level === 2 ? headingColor.h2 : headingColor.h3
  if (level === 1) return `text-center text-base font-semibold tracking-tight ${color}`
  if (level === 2) return `text-center text-[13px] font-semibold uppercase tracking-wide ${color}`
  return `text-center text-[13px] font-semibold ${color}`
}

function sectionGroupTone(text: string): ReplyGroupTone | null {
  for (const block of linesToBlocks(text.split('\n'))) {
    if (block.type === 'heading' || (block.type === 'paragraph' && isBoldTitle(block.text))) {
      const tone = replyGroupTone(block.text)
      if (tone) return tone
    }
  }
  return null
}

function SectionBlocks({
  text,
  headingColor,
  mutedClass,
  tone,
}: {
  text: string
  headingColor: { h1: string; h2: string; h3: string }
  mutedClass: string
  tone: ReplyGroupTone | null
}) {
  const lines = text.split('\n')
  const blocks = linesToBlocks(lines)
  const marker = tone ? REPLY_GROUP_TONE_CLASS[tone].marker : 'marker:text-cyan-500/90'

  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        if (block.type === 'heading') {
          const blockTone = replyGroupTone(block.text) ?? tone
          return (
            <p key={bi} className={headingClass(block.level, headingColor, blockTone)}>
              {renderInline(block.text, `h-${bi}`, blockTone ? REPLY_GROUP_TONE_CLASS[blockTone].text : 'text-inherit')}
            </p>
          )
        }
        if (block.type === 'list') {
          const listCls = `list-outside space-y-1.5 pl-5 text-[13px] leading-relaxed ${mutedClass} ${marker}`
          const items = block.items.map((item, ii) => (
            <li key={ii} className="pl-0.5">
              {renderInline(item, `li-${bi}-${ii}`, 'text-gray-100')}
            </li>
          ))
          return block.ordered ? (
            <ol key={bi} className={`${listCls} list-decimal`}>
              {items}
            </ol>
          ) : (
            <ul key={bi} className={`${listCls} list-disc`}>
              {items}
            </ul>
          )
        }
        const titleLine = isBoldTitle(block.text)
        const leadIn = isReplyLeadIn(block.text)
        const blockTone = titleLine ? replyGroupTone(block.text) : null
        return (
          <p
            key={bi}
            className={`text-[13px] leading-relaxed ${mutedClass}${titleLine || leadIn ? ' text-center' : ''}`}
          >
            {renderInline(block.text, `p-${bi}`, blockTone ? REPLY_GROUP_TONE_CLASS[blockTone].text : 'text-gray-50')}
          </p>
        )
      })}
    </div>
  )
}

/**
 * Renders assistant-style markdown: headings (#–###), **bold**, lists (- or 1.).
 * Double newlines create a new “subject” block with extra vertical space.
 */
export function AdminAssistantRichText({ content, compact = false }: { content: string; compact?: boolean }) {
  const normalized = stripAdminChatActionChoiceMarkup(content).replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const sections = normalized.split(/\n{2,}/).filter((s) => s.trim())

  const headingColor = {
    h1: 'text-sky-300',
    h2: 'text-violet-300/95',
    h3: 'text-emerald-300/95',
  }

  const multi = sections.length > 1

  return (
    <div className={`text-gray-100 ${multi ? (compact ? 'space-y-4' : 'space-y-10') : ''}`}>
      {sections.map((section, si) => {
        const tone = sectionGroupTone(section)
        const rule = tone
          ? REPLY_GROUP_TONE_CLASS[tone].rule
          : compact
            ? 'border-purple-800/70'
            : 'border-cyan-950/90'
        return (
          <section
            key={si}
            className={multi ? `border-l-2 ${rule} ${compact ? 'pl-2.5' : 'pl-3.5'}` : ''}
          >
            <SectionBlocks text={section} headingColor={headingColor} mutedClass="text-gray-200/95" tone={tone} />
          </section>
        )
      })}
    </div>
  )
}

export function replyThreadTitle(raw: string): string {
  const line = stripAdminChatActionChoiceMarkup(raw)
    .split('\n')
    .map((row) =>
      row
        .replace(/^#{1,3}\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/^[-*•|]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .find((row) => row && row !== '---' && !row.startsWith('|'))
  if (!line) return 'New thread'
  return line.length > 40 ? `${line.slice(0, 38)}…` : line
}

export function AdminReplyCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    const value = stripAdminChatActionChoiceMarkup(text)
    if (!value) return
    let wrote = false
    try {
      await navigator.clipboard.writeText(value)
      wrote = true
    } catch {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      wrote = document.execCommand('copy')
      area.remove()
    }
    if (!wrote) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="rounded-md border border-gray-600/80 bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
      aria-label={copied ? 'Copied reply' : 'Copy reply'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function AdminChatReplySuggestions({
  items,
  disabled,
  onPick,
}: {
  items: { id: string; label: string; message: string }[]
  disabled?: boolean
  onPick: (message: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-700/80 pt-3">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          title={item.message}
          onClick={() => onPick(item.message)}
          className={
            index === 0
              ? 'rounded-md bg-cyan-700 px-2.5 py-1.5 text-left text-[12px] font-semibold leading-snug text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50'
              : 'rounded-md border border-cyan-800/80 bg-cyan-950/60 px-2.5 py-1.5 text-left text-[12px] font-medium leading-snug text-cyan-50 hover:bg-cyan-900/80 disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function AdminChatActionChoices({
  content,
  disabled,
  onPick,
}: {
  content: string
  disabled?: boolean
  onPick: (message: string) => void
}) {
  const parsed = parseAdminChatActionChoices(content)
  if (!parsed) return null

  const buttonClass =
    'rounded-md border border-cyan-800/80 bg-cyan-950/60 px-2.5 py-1.5 text-left text-[12px] font-medium leading-snug text-cyan-50 hover:bg-cyan-900/80 disabled:cursor-not-allowed disabled:opacity-50'

  const renderChoice = (choice: AdminChatActionChoice, emphasize = false) => (
    <button
      key={choice.id}
      type="button"
      disabled={disabled}
      title={choice.message}
      onClick={() => onPick(choice.message)}
      className={
        emphasize
          ? 'rounded-md bg-cyan-700 px-2.5 py-1.5 text-left text-[12px] font-semibold leading-snug text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50'
          : buttonClass
      }
    >
      {choice.label}
    </button>
  )

  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-700/80 pt-3">
      <div className="flex flex-wrap gap-1.5">{parsed.options.map((choice) => renderChoice(choice))}</div>
      {parsed.proceedAll ? renderChoice(parsed.proceedAll, true) : null}
    </div>
  )
}

export function AdminChatPlainText({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed ${className ?? ''}`}>
      {content}
    </div>
  )
}
