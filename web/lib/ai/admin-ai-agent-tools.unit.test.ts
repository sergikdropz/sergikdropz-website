import { describe, expect, it } from 'vitest'
import {
  parseAgentToolCalls,
  stripAgentToolCalls,
  isAgentLoopTool,
  isAgentReadTool,
  replyTriedBrokenToolCall,
} from '@/lib/ai/admin-ai-agent-tools'

describe('admin-ai-agent-tools', () => {
  it('parses fenced, trailing-comma, and split-line /tool calls, including dry-run previews', () => {
    const messy = [
      '```',
      '/tool query_release_studio_snapshot',
      '{"releaseId":"abc",}',
      '```',
      '/tool admin_browser {"action":"read"}',
      '/tool admin_browser {"action":"navigate","url":"https://distrokid.com/mymusic/"}',
      '/tool admin_browser {"action":"click","target":"Edit"}',
      '/tool patch_release_marketing_copy {"releaseId":"abc"}',
    ].join('\n')
    const calls = parseAgentToolCalls(messy)
    expect(calls.map((c) => c.tool)).toEqual([
      'query_release_studio_snapshot',
      'admin_browser',
      'admin_browser',
      'admin_browser',
      'patch_release_marketing_copy',
    ])
    expect(calls[0]?.payload).toEqual({ releaseId: 'abc' })
    expect(replyTriedBrokenToolCall('I will /tool now')).toBe(true)
    expect(replyTriedBrokenToolCall(messy)).toBe(false)
    expect(isAgentReadTool('query_ops_snapshot')).toBe(true)
    expect(isAgentReadTool('assign_isrcs')).toBe(false)
    expect(isAgentLoopTool('assign_isrcs')).toBe(true)
    expect(isAgentLoopTool('pull_distrokid_isrcs')).toBe(true)
    expect(isAgentLoopTool('run_applescript')).toBe(false)
    expect(stripAgentToolCalls(messy)).not.toContain('/tool')
  })
})