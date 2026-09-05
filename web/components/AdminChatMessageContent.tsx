'use client'

import { Fragment } from 'react'

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

function SectionBlocks({
  text,
  headingColor,
  mutedClass,
}: {
  text: string
  headingColor: { h1: string; h2: string; h3: string }
  mutedClass: string
}) {
  const lines = text.split('\n')
  const blocks = linesToBlocks(lines)

  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        if (block.type === 'heading') {
          const cls =
            block.level === 1
              ? `text-base font-semibold tracking-tight ${headingColor.h1}`
              : block.level === 2
                ? `text-[13px] font-semibold uppercase tracking-wide ${headingColor.h2}`
                : `text-[13px] font-semibold ${headingColor.h3}`
          return (
            <p key={bi} className={cls}>
              {renderInline(block.text, `h-${bi}`, 'text-gray-50')}
            </p>
          )
        }
        if (block.type === 'list') {
          const listCls = `list-outside space-y-1.5 pl-5 text-[13px] leading-relaxed ${mutedClass} marker:text-cyan-500/90`
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
        return (
          <p key={bi} className={`text-[13px] leading-relaxed ${mutedClass}`}>
            {renderInline(block.text, `p-${bi}`, 'text-gray-50')}
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
  const normalized = content.replace(/\r\n/g, '\n').trim()
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
      {sections.map((section, si) => (
        <section
          key={si}
          className={
            multi ? `${compact ? 'border-l-2 border-purple-800/70 pl-2.5' : 'border-l-2 border-cyan-950/90 pl-3.5'}` : ''
          }
        >
          <SectionBlocks text={section} headingColor={headingColor} mutedClass="text-gray-200/95" />
        </section>
      ))}
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
