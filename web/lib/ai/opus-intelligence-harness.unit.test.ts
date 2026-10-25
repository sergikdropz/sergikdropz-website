import { afterEach, describe, expect, it } from 'vitest'
import { composeLocalAuditReply } from '@/lib/ai/ollama-admin-grounding'
import {
  DEFAULT_OPUS_HARNESS_MODEL,
  opusHarnessModelId,
  opusHarnessSystemPrompt,
  opusHarnessUserMessage,
} from '@/lib/ai/opus-intelligence-harness'

describe('opus intelligence harness', () => {
  const previous = process.env.ANTHROPIC_HARNESS_MODEL
  afterEach(() => {
    if (previous === undefined) delete process.env.ANTHROPIC_HARNESS_MODEL
    else process.env.ANTHROPIC_HARNESS_MODEL = previous
  })

  it('defaults to claude opus 5.5', () => {
    delete process.env.ANTHROPIC_HARNESS_MODEL
    expect(opusHarnessModelId()).toBe(DEFAULT_OPUS_HARNESS_MODEL)
    expect(DEFAULT_OPUS_HARNESS_MODEL).toBe('claude-opus-5-5')
  })

  it('builds a probe packet for SergikAI and requires an audit shape', () => {
    process.env.ANTHROPIC_HARNESS_MODEL = 'claude-opus-5-5'
    const system = opusHarnessSystemPrompt()
    const user = opusHarnessUserMessage({
      message: 'audit the release',
      adminAi: 'ollama: admin chat uses qwen2.5vl:7b when that tag is installed',
      harness: 'OlliN Pro API reachable · Harness probe OK',
      activeSkillId: 'product_strategy',
    })
    expect(system).toMatch(/## Verdict/)
    expect(system).toMatch(/SergikAI/)
    expect(user).toMatch(/audit the release/)
    expect(user).toMatch(/POLYMATH \+ ADMIN AI DESK/)
    expect(user).toMatch(/\[product_strategy\] \(active\)/)
    expect(user).toMatch(/Harness probe OK/)
  })

  it('records an Opus outage on the local audit', () => {
    const text = composeLocalAuditReply({
      message: 'audit',
      adminAi: 'anthropic: configured',
      harness:
        'OlliN Pro API reachable · Harness probe OK\nClaude Opus intelligence offline: credit balance is too low',
    })
    expect(text).toMatch(/Claude Opus: credit balance is too low/)
  })
})