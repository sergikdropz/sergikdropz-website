import type { SonicDnaReportSectionId } from '@/lib/audio/sonic-dna-report-sections'
import { SONIC_DNA_REPORT_SECTION_IDS } from '@/lib/audio/sonic-dna-report-sections'

export type SonicDnaReviewPatch = { sectionId: SonicDnaReportSectionId; text: string }

function isSectionId(value: unknown): value is SonicDnaReportSectionId {
  return typeof value === 'string' && (SONIC_DNA_REPORT_SECTION_IDS as readonly string[]).includes(value)
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/** Pull a JSON string field even when the rest of the object is truncated or invalid. */
export function extractJsonStringField(text: string, field: string): string | null {
  const key = `"${field}"`
  const idx = text.indexOf(key)
  if (idx < 0) return null
  let i = idx + key.length
  while (i < text.length && /[\s:]/.test(text[i] || '')) i += 1
  if (text[i] !== '"') return null
  i += 1
  let out = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      out += ch + text[i + 1]
      i += 2
      continue
    }
    if (ch === '"') return unescapeJsonString(out)
    out += ch
    i += 1
  }
  return unescapeJsonString(out)
}

export function extractJsonObjectLoose(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] || text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      /* fall through */
    }
  }
  const answer = extractJsonStringField(raw, 'answer')
  if (!answer) return null
  return { answer }
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}/.test(line)
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** Turn GitHub-style tables into bullets so they fit a narrow chat column. */
export function markdownTablesToLists(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const header = lines[i] || ''
    const next = lines[i + 1] || ''
    if (header.includes('|') && isTableSeparator(next)) {
      const heads = splitTableRow(header)
      i += 2
      while (i < lines.length && (lines[i] || '').includes('|') && !isTableSeparator(lines[i] || '')) {
        const cells = splitTableRow(lines[i] || '')
        const parts = heads
          .map((head, idx) => {
            const value = cells[idx] || ''
            if (!value) return ''
            return heads.length > 1 && head ? `**${head}:** ${value}` : value
          })
          .filter(Boolean)
        if (parts.length) out.push(`- ${parts.join(' — ')}`)
        i += 1
      }
      continue
    }
    out.push(header)
    i += 1
  }
  return out.join('\n')
}

export function formatSonicDnaReviewMarkdown(text: string): string {
  let next = text.replace(/\r\n/g, '\n').trim()
  next = next.replace(/^```(?:json|markdown)?\s*/i, '').replace(/```$/i, '').trim()
  next = markdownTablesToLists(next)
  next = next.replace(/^#{4,}\s+/gm, '### ')
  next = next.replace(/[ \t]+\n/g, '\n')
  next = next.replace(/\n{3,}/g, '\n\n')
  return next.trim()
}

export function unwrapSonicDnaReviewReply(raw: string): {
  answer: string
  warnings: string[]
  patches: SonicDnaReviewPatch[]
} {
  const parsed = extractJsonObjectLoose(raw)
  const answerRaw =
    typeof parsed?.answer === 'string' && parsed.answer.trim()
      ? parsed.answer
      : raw.startsWith('{') || raw.includes('```json')
        ? extractJsonStringField(raw, 'answer') || raw
        : raw
  const warnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const patches = Array.isArray(parsed?.patches)
    ? parsed.patches
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const row = item as { sectionId?: unknown; text?: unknown }
          if (!isSectionId(row.sectionId) || typeof row.text !== 'string') return null
          const text = row.text.trim()
          if (!text) return null
          return { sectionId: row.sectionId, text }
        })
        .filter((item): item is SonicDnaReviewPatch => Boolean(item))
    : []
  return { answer: formatSonicDnaReviewMarkdown(answerRaw), warnings, patches }
}
