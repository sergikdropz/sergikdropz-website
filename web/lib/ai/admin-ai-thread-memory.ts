/**
 * Sticky thread memory across skill switches (Cursor-like session continuity).
 */

import { formatChecklistForPrompt, type ThreadChecklist } from '@/lib/ai/admin-ai-thread-checklist'

export type AdminAiThreadMemory = {
  goal?: string
  releaseId?: string
  releaseTitle?: string
  deskUrl?: string
  deskLabel?: string
  lastSkillId?: string
  /** Model-facing recap built from this turn's facts. */
  summary?: string
  /** ISRCs and UPCs that appeared in tool results. */
  codes: string[]
  /** Source paths cited by read_workspace. */
  citedFiles: string[]
  /** Question the last reply left open. */
  openQuestion?: string
  /** Steps already done, and the step to do next. */
  checklist?: ThreadChecklist
  notes: string[]
  updatedAt: number
}

export function emptyThreadMemory(): AdminAiThreadMemory {
  return { notes: [], codes: [], citedFiles: [], updatedAt: 0 }
}

export function normalizeThreadMemory(raw: unknown): AdminAiThreadMemory {
  if (!raw || typeof raw !== 'object') return emptyThreadMemory()
  const row = raw as Record<string, unknown>
  const notes = Array.isArray(row.notes)
    ? row.notes.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 12)
    : []
  const codes = stringList(row.codes, 12, 20)
  const citedFiles = stringList(row.citedFiles, 8, 180)
  return {
    goal: typeof row.goal === 'string' ? row.goal.trim().slice(0, 400) : undefined,
    releaseId: typeof row.releaseId === 'string' ? row.releaseId.trim() : undefined,
    releaseTitle: typeof row.releaseTitle === 'string' ? row.releaseTitle.trim().slice(0, 200) : undefined,
    deskUrl: typeof row.deskUrl === 'string' ? row.deskUrl.trim().slice(0, 500) : undefined,
    deskLabel: typeof row.deskLabel === 'string' ? row.deskLabel.trim().slice(0, 80) : undefined,
    lastSkillId: typeof row.lastSkillId === 'string' ? row.lastSkillId.trim() : undefined,
    summary: typeof row.summary === 'string' ? row.summary.trim().slice(0, 1200) : undefined,
    codes,
    citedFiles,
    openQuestion: typeof row.openQuestion === 'string' ? row.openQuestion.trim().slice(0, 240) : undefined,
    checklist: normalizeChecklist(row.checklist),
    notes,
    updatedAt: typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
  }
}

export type ThreadMemoryPatch = Partial<
  Pick<
    AdminAiThreadMemory,
    | 'goal'
    | 'releaseId'
    | 'releaseTitle'
    | 'deskUrl'
    | 'deskLabel'
    | 'lastSkillId'
    | 'summary'
    | 'codes'
    | 'citedFiles'
    | 'openQuestion'
  >
> & { addNote?: string; checklist?: ThreadChecklist | null }

export function mergeThreadMemory(
  prev: AdminAiThreadMemory,
  patch: ThreadMemoryPatch | null | undefined,
): AdminAiThreadMemory {
  if (!patch) return prev
  const notes = [...prev.notes]
  if (patch.addNote?.trim()) {
    notes.push(patch.addNote.trim().slice(0, 240))
  }
  return {
    goal: patch.goal !== undefined ? patch.goal : prev.goal,
    releaseId: patch.releaseId !== undefined ? patch.releaseId : prev.releaseId,
    releaseTitle: patch.releaseTitle !== undefined ? patch.releaseTitle : prev.releaseTitle,
    deskUrl: patch.deskUrl !== undefined ? patch.deskUrl : prev.deskUrl,
    deskLabel: patch.deskLabel !== undefined ? patch.deskLabel : prev.deskLabel,
    lastSkillId: patch.lastSkillId !== undefined ? patch.lastSkillId : prev.lastSkillId,
    summary: patch.summary !== undefined ? patch.summary : prev.summary,
    codes: patch.codes !== undefined ? patch.codes : prev.codes,
    citedFiles: patch.citedFiles !== undefined ? patch.citedFiles : prev.citedFiles,
    openQuestion: patch.openQuestion !== undefined ? patch.openQuestion || undefined : prev.openQuestion,
    checklist: patch.checklist === null ? undefined : patch.checklist !== undefined ? patch.checklist : prev.checklist,
    notes: notes.slice(-12),
    updatedAt: Date.now(),
  }
}

export function formatThreadMemoryForPrompt(memory: AdminAiThreadMemory | null | undefined): string {
  if (
    !memory ||
    (!memory.goal &&
      !memory.releaseId &&
      !memory.deskUrl &&
      !memory.summary &&
      !memory.openQuestion &&
      !memory.codes.length &&
      !memory.citedFiles.length &&
      !memory.checklist?.done.length &&
      !memory.checklist?.next.length &&
      !memory.notes.length)
  ) {
    return ''
  }
  const lines = ['THREAD MEMORY (sticky across skills — prefer these anchors)']
  if (memory.summary) lines.push(`Summary: ${memory.summary}`)
  if (memory.codes.length) lines.push(`Codes seen: ${memory.codes.join(', ')}`)
  if (memory.citedFiles.length) lines.push(`Files cited: ${memory.citedFiles.join(', ')}`)
  if (memory.openQuestion) lines.push(`Open question: ${memory.openQuestion}`)
  lines.push(...formatChecklistForPrompt(memory.checklist))
  if (memory.goal) lines.push(`Goal: ${memory.goal}`)
  if (memory.releaseId) {
    lines.push(`Release: ${memory.releaseTitle || memory.releaseId} (${memory.releaseId})`)
  }
  if (memory.deskUrl) {
    lines.push(`Open desk: ${memory.deskLabel || memory.deskUrl} — ${memory.deskUrl}`)
  }
  if (memory.lastSkillId) lines.push(`Last skill: ${memory.lastSkillId}`)
  if (memory.notes.length) {
    lines.push('Notes:')
    for (const note of memory.notes.slice(-6)) lines.push(`- ${note}`)
  }
  return lines.join('\n')
}

/** Heuristic memory patch from this turn (no LLM). */
export function inferMemoryPatchFromTurn(input: {
  message: string
  releaseId?: string | null
  releaseTitle?: string | null
  deskUrl?: string | null
  deskLabel?: string | null
  skillId?: string | null
}): ThreadMemoryPatch {
  const patch: ThreadMemoryPatch = {}
  if (input.releaseId) {
    patch.releaseId = input.releaseId
    if (input.releaseTitle) patch.releaseTitle = input.releaseTitle
  }
  if (input.deskUrl) {
    patch.deskUrl = input.deskUrl
    if (input.deskLabel) patch.deskLabel = input.deskLabel
  }
  if (input.skillId) patch.lastSkillId = input.skillId

  const goalMatch = input.message.match(
    /(?:goal|working on|focus(?:ing)? on|need to)\s*[:—-]?\s*(.+)$/im,
  )
  if (goalMatch?.[1]) {
    patch.goal = goalMatch[1].trim().slice(0, 400)
  }
  return patch
}

function normalizeChecklist(raw: unknown): ThreadChecklist | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const done = stringList(row.done, 8, 120)
  const next = stringList(row.next, 8, 120)
  if (!done.length && !next.length) return undefined
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 40) : 'custom'
  return { id, done, next }
}

function stringList(raw: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const text = String(item || '').trim().slice(0, itemMax)
    if (!text || out.includes(text)) continue
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function uniqueAppend(prev: string[], next: string[], max: number): string[] {
  const out = [...prev]
  for (const item of next) {
    if (!item || out.includes(item)) continue
    out.push(item)
  }
  return out.slice(-max)
}

/** Facts worth keeping, taken from tool output. No model call. */
export function factsFromTurn(input: {
  userText: string
  assistantText: string
  toolBodies: string[]
  previous: AdminAiThreadMemory
}): ThreadMemoryPatch {
  const corpus = input.toolBodies.join('\n')
  const isrcs = corpus.match(/\b[A-Z]{2}[A-Z0-9]{3}\d{7}\b/g) ?? []
  const upcs = /\bupc\b/i.test(corpus) ? corpus.match(/\b\d{12,13}\b/g) ?? [] : []
  const files = corpus.match(/(?:web\/|knowledge\/)[A-Za-z0-9_./-]+\.(?:tsx?|md|sql)/g) ?? []
  const libFiles = corpus.match(/\blib\/[A-Za-z0-9_./-]+\.tsx?\b/g) ?? []
  const asked = input.assistantText.trim().match(/([^.!\n]{8,180}\?)\s*$/)
  const sentence =
    input.assistantText.replace(/\s+/g, ' ').trim().slice(0, 280) ||
    input.userText.replace(/\s+/g, ' ').trim().slice(0, 180)
  const codes = uniqueAppend(input.previous.codes, [...isrcs, ...upcs], 12)
  const citedFiles = uniqueAppend(input.previous.citedFiles, [...files, ...libFiles], 8)
  const summaryParts = [
    codes.length ? `Codes: ${codes.slice(-6).join(', ')}` : '',
    citedFiles.length ? `Files: ${citedFiles.slice(-4).join(', ')}` : '',
    sentence,
  ].filter(Boolean)
  return {
    codes,
    citedFiles,
    openQuestion: asked?.[1]?.trim().slice(0, 240) || '',
    summary: summaryParts.join('\n').slice(0, 1200),
  }
}
