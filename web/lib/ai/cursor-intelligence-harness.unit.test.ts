import { afterEach, describe, expect, it } from 'vitest'
import { composeLocalAuditReply } from '@/lib/ai/ollama-admin-grounding'
import {
  cursorBriefScriptPath,
  cursorHarnessPrompt,
  runCursorIntelligenceHarness,
} from '@/lib/ai/cursor-intelligence-harness'

describe('cursor intelligence harness', () => {
  const previous = process.env.CURSOR_API_KEY
  afterEach(() => {
    if (previous === undefined) delete process.env.CURSOR_API_KEY
    else process.env.CURSOR_API_KEY = previous
  })

  it('points at the MCP brief bridge', () => {
    expect(cursorBriefScriptPath()).toMatch(/mcp\/sergik-chat\/brief\.mjs$/)
  })

  it('packs the polymath desk and probes for the Cursor brain', () => {
    const prompt = cursorHarnessPrompt({
      message: 'audit the release',
      adminAi: 'ollama: admin chat uses qwen2.5vl:7b when that tag is installed',
      harness: 'OlliN Pro API reachable · Harness probe OK',
      activeSkillId: 'sergik_intelligence',
    })
    expect(prompt).toMatch(/## Verdict/)
    expect(prompt).toMatch(/audit the release/)
    expect(prompt).toMatch(/\[sergik_intelligence\] \(active\)/)
    expect(prompt).toMatch(/Harness probe OK/)
  })

  it('stops before a Cursor call when the plan key is missing', async () => {
    delete process.env.CURSOR_API_KEY
    const result = await runCursorIntelligenceHarness({
      message: 'audit',
      adminAi: 'anthropic: configured',
      harness: 'OlliN Pro API reachable · Harness probe OK',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/CURSOR_API_KEY/)
    expect(result.error).toMatch(/not Anthropic API credits/)
  })

  it('keeps a missing Cursor key on the local audit', () => {
    const text = composeLocalAuditReply({
      message: 'audit',
      adminAi: 'anthropic: configured',
      harness: 'OlliN Pro API reachable · Harness probe OK\nCursor intelligence offline: Set CURSOR_API_KEY',
    })
    expect(text).toMatch(/Cursor: Set CURSOR_API_KEY/)
  })
})