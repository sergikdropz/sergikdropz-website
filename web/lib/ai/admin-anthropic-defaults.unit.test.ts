import { describe, expect, it } from 'vitest'
import {
  anthropicChatModelCandidates,
  DEFAULT_ANTHROPIC_CHAT_MODEL,
  isAnthropicModelNotFoundError,
} from '@/lib/ai/admin-anthropic-defaults'

describe('anthropicChatModelCandidates', () => {
  it('skips retired claude-3-5-sonnet-latest from env and prefers sonnet 4.6', () => {
    const prev = process.env.ANTHROPIC_CHAT_MODEL
    process.env.ANTHROPIC_CHAT_MODEL = 'claude-3-5-sonnet-latest'
    try {
      const ids = anthropicChatModelCandidates(null)
      expect(ids[0]).toBe(DEFAULT_ANTHROPIC_CHAT_MODEL)
      expect(ids).not.toContain('claude-3-5-sonnet-latest')
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_CHAT_MODEL
      else process.env.ANTHROPIC_CHAT_MODEL = prev
    }
  })

  it('detects Anthropic model not found errors', () => {
    expect(
      isAnthropicModelNotFoundError({
        status: 404,
        message: '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-sonnet-latest"}}',
      }),
    ).toBe(true)
    expect(isAnthropicModelNotFoundError(new Error('rate limit'))).toBe(false)
  })
})
