import { describe, expect, it } from 'vitest'
import {
  activeComposerMention,
  expandAdminAiMentions,
  filterMentionMenu,
  parseAdminAiMentions,
} from '@/lib/ai/admin-ai-mentions'

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

  it('tracks the @ token at the caret and filters the menu by the letters typed', () => {
    expect(activeComposerMention('check @rel', 10)).toEqual({ start: 6, query: '@rel' })
    expect(activeComposerMention('sergik@dropz.com', 12)).toBeNull()
    expect(activeComposerMention('use @release now', 13)).toBeNull()
    expect(activeComposerMention('@desk:YouTube ', 14)?.query).toBe('@desk:YouTube ')
    expect(activeComposerMention('@you', 4)?.query).toBe('@you')

    expect(filterMentionMenu('@rel').map((item) => item.label)).toEqual(['@release'])
    expect(filterMentionMenu('@you').map((item) => item.label)).toEqual([
      '@desk:YouTube',
      '@desk:YouTube Studio',
    ])
    expect(filterMentionMenu('@d').map((item) => item.label)).toContain('@due')
    expect(filterMentionMenu('@d').map((item) => item.label)).toContain('@desk:DistroKid')
    expect(filterMentionMenu('@zzz')).toEqual([])
  })
})
