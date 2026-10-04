import { describe, expect, it } from 'vitest'
import { expandAdminAiMentions, parseAdminAiMentions } from '@/lib/ai/admin-ai-mentions'

describe('admin-ai-mentions', () => {
  it('parses @ mentions and expands desk + release requests', () => {
    const message = 'Check @desk:DistroKid and @release for UPC'
    expect(parseAdminAiMentions(message).map((m) => m.kind)).toEqual(['desk', 'release'])
    const expanded = expandAdminAiMentions({
      message,
      releaseId: 'rel-1',
      releaseTitle: 'Night Drive',
    })
    expect(expanded.context).toContain('Desk: DistroKid')
    expect(expanded.requestedTools.some((t) => t.tool === 'query_release_studio_snapshot')).toBe(true)
  })
})
