import { isContinuationOnlyUserMessage } from '@/lib/ai/chat-skill-context'

/** Echoed to the client for “Explain last reply” (no message body). */
export type AdminChatRoutingEcho = {
  continuationOnly: boolean
  stickySkillId: string | null
  stickySkillRequested: string | null
  stickyDroppedStale: boolean
  stickyInferredAtMs: number | null
  stickyPersonaApplied: boolean
  promptTruncated: boolean
}

/** Max user+attachments text sent to admin chat LLM (prompt stored on ai_runs is clamped the same way). */
export const ADMIN_AI_CHAT_PROMPT_MAX_CHARS = 24_000

/** Client + server: max age for honoring sticky skill when `stickySkillInferredAt` is validated. */
export const STICKY_SKILL_CLIENT_TTL_MS = 45 * 60 * 1000

/** Allow small client/server clock skew when validating `stickySkillInferredAt`. */
export const STICKY_SKILL_INFERRED_AT_SKEW_MS = 120_000

export function clampAdminAiChatPrompt(message: string): { message: string; truncated: boolean } {
  const t = message.trim()
  if (t.length <= ADMIN_AI_CHAT_PROMPT_MAX_CHARS) {
    return { message: t, truncated: false }
  }
  return {
    message: `${t.slice(0, ADMIN_AI_CHAT_PROMPT_MAX_CHARS)}\n\n[truncated by server — original length ${t.length} chars]`,
    truncated: true,
  }
}

export function normalizeRegisteredSkillId(raw: string | null | undefined, allowed: Set<string>): string | null {
  const t = raw?.trim()
  if (!t || !allowed.has(t)) return null
  return t
}

export function computeAdminChatStickyRouting(input: {
  message: string
  skillId: string | null
  stickySkillId: string | null
  inferredSkillId: string
}): { continuationOnly: boolean; stickyPersonaApplied: boolean } {
  const continuationOnly = isContinuationOnlyUserMessage(input.message)
  const stickyPersonaApplied =
    Boolean(input.stickySkillId) &&
    continuationOnly &&
    input.inferredSkillId === input.stickySkillId &&
    !input.skillId
  return { continuationOnly, stickyPersonaApplied }
}

/**
 * Parse client `stickySkillInferredAt` (epoch ms or ISO string). Returns null if missing/invalid.
 */
export function parseStickySkillInferredAtMs(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 0 && raw < 1e15 ? raw : null
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    const n = Number.parseInt(t, 10)
    if (Number.isFinite(n) && String(n) === t && n > 0 && n < 1e15) return n
    const d = Date.parse(t)
    return Number.isFinite(d) && d > 0 ? d : null
  }
  return null
}

/**
 * When `issuedAtMs` is null, sticky is not server-age-gated (legacy clients).
 * When set, must fall within [now - TTL - skew, now + skew].
 */
export function isStickyInferredAtFreshForServer(issuedAtMs: number | null, nowMs: number): boolean {
  if (issuedAtMs === null) return true
  const skew = STICKY_SKILL_INFERRED_AT_SKEW_MS
  const maxAge = STICKY_SKILL_CLIENT_TTL_MS + skew
  if (issuedAtMs > nowMs + skew) return false
  if (nowMs - issuedAtMs > maxAge) return false
  return true
}

/**
 * If client sent a normalized sticky id and a parsed inferred-at that is stale, drop sticky for inference.
 */
export function resolveEffectiveStickySkillId(input: {
  stickySkillIdNormalized: string | null
  stickyInferredAtMs: number | null
  nowMs: number
}): { effectiveStickySkillId: string | null; droppedStale: boolean } {
  const { stickySkillIdNormalized, stickyInferredAtMs, nowMs } = input
  if (!stickySkillIdNormalized) {
    return { effectiveStickySkillId: null, droppedStale: false }
  }
  if (stickyInferredAtMs === null) {
    return { effectiveStickySkillId: stickySkillIdNormalized, droppedStale: false }
  }
  if (!isStickyInferredAtFreshForServer(stickyInferredAtMs, nowMs)) {
    return { effectiveStickySkillId: null, droppedStale: true }
  }
  return { effectiveStickySkillId: stickySkillIdNormalized, droppedStale: false }
}
