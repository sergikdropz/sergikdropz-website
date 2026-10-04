import { describe, expect, it } from 'vitest'
import {
  parseAgentToolCalls,
  stripAgentToolCalls,
  isAgentReadTool,
  replyTriedBrokenToolCall,
} from '@/lib/ai/admin-ai-agent-tools'

describe('admin-ai-agent-tools', () => {
  it('parses fenced, trailing-comma, and split-line /tool calls; still blocks writes and clicks', () => {
    const messy = [
      '```',
      '/tool query_release_studio_snapshot',
      '{"releaseId":"abc",}',
      '```',
      '/tool admin_browser {"action":"probe_fields"}',
      '/tool admin_browser {"action":"click","x":0.5,"y":0.5}',
      '/tool patch_release_marketing_copy {"releaseId":"abc"}',
    ].join('\n')
    const calls = parseAgentToolCalls(messy)
    expect(calls.map((c) => c.tool)).toEqual([
      'query_release_studio_snapshot',
      'admin_browser',
    ])
    expect(calls[0]?.payload).toEqual({ releaseId: 'abc' })
    expect(replyTriedBrokenToolCall('I will /tool now')).toBe(true)
    expect(replyTriedBrokenToolCall(messy)).toBe(false)
    expect(isAgentReadTool('query_ops_snapshot')).toBe(true)
    expect(isAgentReadTool('assign_isrcs')).toBe(false)
    expect(stripAgentToolCalls(messy)).not.toContain('/tool')
  })
})