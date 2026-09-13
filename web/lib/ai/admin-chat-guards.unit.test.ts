import { describe, expect, it } from 'vitest'
import {
  ADMIN_AI_CHAT_PROMPT_MAX_CHARS,
  clampAdminAiChatPrompt,
  computeAdminChatStickyRouting,
  normalizeRegisteredSkillId,
  parseStickySkillInferredAtMs,
  isStickyInferredAtFreshForServer,
  resolveEffectiveStickySkillId,
} from '@/lib/ai/admin-chat-guards'

describe('clampAdminAiChatPrompt', () => {
  it('returns trimmed text unchanged when under limit', () => {
    const { message, truncated } = clampAdminAiChatPrompt('  hello  ')
    expect(message).toBe('hello')
    expect(truncated).toBe(false)
  })

  it('truncates over limit and marks truncated', () => {
    const big = 'x'.repeat(ADMIN_AI_CHAT_PROMPT_MAX_CHARS + 500)
    const { message, truncated } = clampAdminAiChatPrompt(big)
    expect(truncated).toBe(true)
    expect(message.length).toBeLessThanOrEqual(ADMIN_AI_CHAT_PROMPT_MAX_CHARS + 80)
    expect(message).toContain('[truncated by server')
  })
})

describe('normalizeRegisteredSkillId', () => {
  const allowed = new Set(['admin_intel', 'product_strategy'])

  it('accepts registered ids', () => {
    expect(normalizeRegisteredSkillId(' admin_intel ', allowed)).toBe('admin_intel')
  })

  it('rejects unknown or empty', () => {
    expect(normalizeRegisteredSkillId('fake', allowed)).toBe(null)
    expect(normalizeRegisteredSkillId('', allowed)).toBe(null)
    expect(normalizeRegisteredSkillId(null, allowed)).toBe(null)
  })
})

describe('computeAdminChatStickyRouting', () => {
  it('marks sticky applied when continuation matches inferred and no lock', () => {
    const r = computeAdminChatStickyRouting({
      message: 'yes',
      skillId: null,
      stickySkillId: 'admin_intel',
      inferredSkillId: 'admin_intel',
    })
    expect(r.continuationOnly).toBe(true)
    expect(r.stickyPersonaApplied).toBe(true)
  })

  it('does not apply sticky when skill is locked', () => {
    const r = computeAdminChatStickyRouting({
      message: 'yes',
      skillId: 'product_strategy',
      stickySkillId: 'admin_intel',
      inferredSkillId: 'product_strategy',
    })
    expect(r.stickyPersonaApplied).toBe(false)
  })

  it('does not apply sticky on substantive message', () => {
    const r = computeAdminChatStickyRouting({
      message: 'What is my release calendar for Q4?',
      skillId: null,
      stickySkillId: 'product_strategy',
      inferredSkillId: 'admin_intel',
    })
    expect(r.continuationOnly).toBe(false)
    expect(r.stickyPersonaApplied).toBe(false)
  })
})

describe('parseStickySkillInferredAtMs', () => {
  it('parses epoch ms and ISO', () => {
    expect(parseStickySkillInferredAtMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(parseStickySkillInferredAtMs('2023-11-15T12:00:00.000Z')).toBe(Date.parse('2023-11-15T12:00:00.000Z'))
  })

  it('returns null for invalid', () => {
    expect(parseStickySkillInferredAtMs(null)).toBe(null)
    expect(parseStickySkillInferredAtMs('')).toBe(null)
    expect(parseStickySkillInferredAtMs(NaN)).toBe(null)
    expect(parseStickySkillInferredAtMs({})).toBe(null)
  })
})

describe('isStickyInferredAtFreshForServer', () => {
  const now = Date.parse('2025-06-01T12:00:00.000Z')

  it('treats null as fresh (no server gate)', () => {
    expect(isStickyInferredAtFreshForServer(null, now)).toBe(true)
  })

  it('accepts recent timestamp', () => {
    expect(isStickyInferredAtFreshForServer(now - 10 * 60 * 1000, now)).toBe(true)
  })

  it('rejects too old', () => {
    expect(isStickyInferredAtFreshForServer(now - 50 * 60 * 1000, now)).toBe(false)
  })

  it('rejects far future', () => {
    expect(isStickyInferredAtFreshForServer(now + 10 * 60 * 1000, now)).toBe(false)
  })
})

describe('resolveEffectiveStickySkillId', () => {
  const now = Date.parse('2025-06-01T12:00:00.000Z')

  it('keeps sticky without inferred-at (legacy)', () => {
    const r = resolveEffectiveStickySkillId({
      stickySkillIdNormalized: 'admin_intel',
      stickyInferredAtMs: null,
      nowMs: now,
    })
    expect(r).toEqual({ effectiveStickySkillId: 'admin_intel', droppedStale: false })
  })

  it('drops sticky when inferred-at is stale', () => {
    const r = resolveEffectiveStickySkillId({
      stickySkillIdNormalized: 'admin_intel',
      stickyInferredAtMs: now - 60 * 60 * 1000,
      nowMs: now,
    })
    expect(r).toEqual({ effectiveStickySkillId: null, droppedStale: true })
  })
})
