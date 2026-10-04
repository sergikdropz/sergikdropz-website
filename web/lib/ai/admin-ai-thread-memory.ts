/**
 * Sticky thread memory across skill switches (Cursor-like session continuity).
 */

export type AdminAiThreadMemory = {
  goal?: string
  releaseId?: string
  releaseTitle?: string
  deskUrl?: string
  deskLabel?: string
  lastSkillId?: string
  notes: string[]
  updatedAt: number
}

export function emptyThreadMemory(): AdminAiThreadMemory {
  return { notes: [], updatedAt: 0 }
}

export function normalizeThreadMemory(raw: unknown): AdminAiThreadMemory {
  if (!raw || typeof raw !== 'object') return emptyThreadMemory()
  const row = raw as Record<string, unknown>
  const notes = Array.isArray(row.notes)
    ? row.notes.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 12)
    : []
  return {
    goal: typeof row.goal === 'string' ? row.goal.trim().slice(0, 400) : undefined,
    releaseId: typeof row.releaseId === 'string' ? row.releaseId.trim() : undefined,
    releaseTitle: typeof row.releaseTitle === 'string' ? row.releaseTitle.trim().slice(0, 200) : undefined,
    deskUrl: typeof row.deskUrl === 'string' ? row.deskUrl.trim().slice(0, 500) : undefined,
    deskLabel: typeof row.deskLabel === 'string' ? row.deskLabel.trim().slice(0, 80) : undefined,
    lastSkillId: typeof row.lastSkillId === 'string' ? row.lastSkillId.trim() : undefined,
    notes,
    updatedAt: typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
  }
}

export type ThreadMemoryPatch = Partial<
  Pick<AdminAiThreadMemory, 'goal' | 'releaseId' | 'releaseTitle' | 'deskUrl' | 'deskLabel' | 'lastSkillId'>
> & { addNote?: string }

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
    notes: notes.slice(-12),
    updatedAt: Date.now(),
  }
}

export function formatThreadMemoryForPrompt(memory: AdminAiThreadMemory | null | undefined): string {
  if (!memory || (!memory.goal && !memory.releaseId && !memory.deskUrl && !memory.notes.length)) {
    return ''
  }
  const lines = ['THREAD MEMORY (sticky across skills — prefer these anchors)']
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
  } else if (input.message.length > 20 && input.message.length < 160 && !/^\/(exec|tool|plan)\b/i.test(input.message)) {
    // Short concrete asks become the sticky goal when none is set by the client.
    patch.addNote = input.message.replace(/\s+/g, ' ').trim().slice(0, 160)
  }
  return patch
}
