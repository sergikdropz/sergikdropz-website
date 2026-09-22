import type { RightsPacketKind } from '@/lib/studio/rights-packets'

export type RightsPacketDraft = {
  text: string
  updated_at?: string
  ai_notes?: string | null
}

export type RightsPacketDrafts = Partial<Record<RightsPacketKind, RightsPacketDraft>>

const KINDS: RightsPacketKind[] = ['split_sheet', 'producer_agreement', 'collab_agreement']

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function parseRightsPacketDrafts(raw: unknown): RightsPacketDrafts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: RightsPacketDrafts = {}
  for (const kind of KINDS) {
    const row = (raw as Record<string, unknown>)[kind]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const text = clean((row as { text?: unknown }).text)
    if (!text) continue
    const updatedAt = clean((row as { updated_at?: unknown }).updated_at)
    const aiNotes = clean((row as { ai_notes?: unknown }).ai_notes)
    out[kind] = {
      text,
      ...(updatedAt ? { updated_at: updatedAt } : {}),
      ...(aiNotes ? { ai_notes: aiNotes } : {}),
    }
  }
  return out
}

export function mergeRightsPacketDrafts(
  existing: unknown,
  patch: unknown,
): RightsPacketDrafts {
  const next = { ...parseRightsPacketDrafts(existing) }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return next
  for (const kind of KINDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, kind)) continue
    const row = (patch as Record<string, unknown>)[kind]
    if (row == null) {
      delete next[kind]
      continue
    }
    if (typeof row !== 'object' || Array.isArray(row)) continue
    const text = clean((row as { text?: unknown }).text)
    if (!text) {
      delete next[kind]
      continue
    }
    const updatedAt = clean((row as { updated_at?: unknown }).updated_at)
    const aiNotes = clean((row as { ai_notes?: unknown }).ai_notes)
    next[kind] = {
      text,
      ...(updatedAt ? { updated_at: updatedAt } : { updated_at: new Date().toISOString() }),
      ...(aiNotes ? { ai_notes: aiNotes } : {}),
    }
  }
  return next
}

export function rightsPacketDraftText(
  drafts: RightsPacketDrafts | null | undefined,
  kind: RightsPacketKind,
): string | null {
  const text = clean(drafts?.[kind]?.text)
  return text || null
}

export function setRightsPacketDraft(
  drafts: RightsPacketDrafts | null | undefined,
  kind: RightsPacketKind,
  text: string,
  extras?: { ai_notes?: string | null },
): RightsPacketDrafts {
  const next = { ...(drafts || {}) }
  const cleaned = clean(text)
  if (!cleaned) {
    delete next[kind]
    return next
  }
  next[kind] = {
    text: cleaned,
    updated_at: new Date().toISOString(),
    ...(extras?.ai_notes != null ? { ai_notes: clean(extras.ai_notes) || null } : {}),
  }
  return next
}

export function clearRightsPacketDraft(
  drafts: RightsPacketDrafts | null | undefined,
  kind: RightsPacketKind,
): RightsPacketDrafts {
  const next = { ...(drafts || {}) }
  delete next[kind]
  return next
}
